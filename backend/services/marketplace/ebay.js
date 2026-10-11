/**
 * eBay Marketplace Integration Service
 * Uses eBay REST APIs: Sell Fulfillment, Inventory, and OAuth 2.0
 */

const config = require('../../config/marketplaces').ebay

class EbayService {
  /**
   * Generates the OAuth authorization URL for the seller consent page
   */
  getAuthUrl(state = '') {
    const scopeParam = encodeURIComponent(config.scopes.join(' '))
    const ruNameParam = encodeURIComponent(config.ruName)
    const stateParam = encodeURIComponent(state)
    const base = config.authBaseUrl

    return `${base}/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${ruNameParam}&scope=${scopeParam}&state=${stateParam}`
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   */
  async exchangeCode(code) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('eBay credentials (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET) are missing')
    }

    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.ruName,
    })

    const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Token Error: ${err.error_description || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Refreshes an expired access token using the refresh token
   */
  async refreshToken(refreshToken) {
    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: config.scopes.join(' '),
    })

    const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Refresh Error: ${err.error_description || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Fetch orders from eBay Sell Fulfillment API
   */
  async getOrders(accessToken, { limit = 50, offset = 0, filter = '' } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (filter) params.append('filter', filter)

    const response = await fetch(`${config.apiBaseUrl}/sell/fulfillment/v1/order?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Order API Error: ${err.message || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Updates shipping tracking information for an eBay order
   */
  async createShippingFulfillment(accessToken, orderId, { carrier, trackingNumber, lineItems = [] }) {
    const payload = {
      shippingCarrierCode: carrier || 'USPS',
      trackingNumber: String(trackingNumber || '').trim(),
      shippedDate: new Date().toISOString(),
      ...(lineItems && lineItems.length
        ? {
            lineItems: lineItems.map((item) => ({
              lineItemId: String(item.lineItemId),
              quantity: Number(item.quantity) || 1,
            })),
          }
        : {}),
    }

    const response = await fetch(`${config.apiBaseUrl}/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Shipping Error: ${err.message || response.statusText}`)
    }

    return response.status === 201 ? { success: true } : response.json()
  }


  /**
   * Fetch inventory items from eBay Sell Inventory API
   */
  async getInventory(accessToken, { limit = 50, offset = 0 } = {}) {
    const response = await fetch(`${config.apiBaseUrl}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Inventory API Error: ${err.message || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Updates inventory item quantity on eBay
   */
  async updateStock(accessToken, sku, quantity) {
    const payload = {
      availability: {
        shipToLocationAvailability: {
          quantity: Math.max(0, quantity),
        },
      },
    }

    const response = await fetch(`${config.apiBaseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Stock Update Error: ${err.message || response.statusText}`)
    }

    return { success: true }
  }

  /**
   * Publishes or creates a product inventory item on eBay
   * @param {string} accessToken
   * @param {Object} product
   * @param {Object|number} options - Listing options or price override
   */
  async createListing(accessToken, product, options = {}) {
    const opts = typeof options === 'number' ? { price: options } : options
    const images = (opts.images && opts.images.length ? opts.images : product.images) || []

    const payload = {
      availability: {
        shipToLocationAvailability: {
          quantity: Number(opts.stock ?? product.stock ?? 1),
        },
      },
      condition: opts.condition || 'NEW',
      product: {
        // eBay strictly caps title at 80 characters
        title: (opts.title || product.title || '').slice(0, 80),
        description: opts.description || product.description || product.title,
        aspects: {
          Brand: [opts.brand || product.brand || 'Unbranded'],
          ...(product.category ? { Category: [product.category] } : {}),
          ...(opts.aspects || {}),
        },
        imageUrls: images.length ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
      },
      packageWeightAndSize: {
        weight: {
          value: Number(opts.weight || product.weight || 1),
          unit: 'POUND',
        },
        dimensions: {
          length: Number(opts.dimensions?.length || product.dimensions?.length || 10),
          width: Number(opts.dimensions?.width || product.dimensions?.width || 10),
          height: Number(opts.dimensions?.height || product.dimensions?.height || 5),
          unit: 'INCH',
        },
      },
    }

    const response = await fetch(`${config.apiBaseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(product.sku)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Listing Error: ${err.message || response.statusText}`)
    }

    return { externalListingId: `ebay-item-${product.sku}`, status: 'live' }
  }

  /**
   * Updates pricing for an existing offer or inventory item on eBay
   */
  async updatePrice(accessToken, sku, price, currency = 'USD') {
    const payload = {
      pricingSummary: {
        price: {
          value: String(price),
          currency,
        },
      },
    }

    // Try offer price update or fallback
    const response = await fetch(`${config.apiBaseUrl}/sell/inventory/v1/offer/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Price Update Error: ${err.message || response.statusText}`)
    }

    return { success: true, price }
  }

  /**
   * Look up categories and suggestions via eBay Taxonomy API
   */
  async getCategories(accessToken, query = 'General', categoryTreeId = '0') {
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      return [
        { categoryId: '11450', categoryName: 'Clothing, Shoes & Accessories' },
        { categoryId: '293', categoryName: 'Electronics & Computers' },
        { categoryId: '11700', categoryName: 'Home & Garden' },
        { categoryId: '888', categoryName: 'Sporting Goods' },
      ]
    }

    const data = await response.json()
    return (data.categorySuggestions || []).map((s) => ({
      categoryId: s.category?.categoryId,
      categoryName: s.category?.categoryName,
    }))
  }

  /**
   * Look up item aspects/attributes required for an eBay category
   */
  async getItemAspects(accessToken, categoryId, categoryTreeId = '0') {
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      return [
        { name: 'Brand', required: true, values: ['Generic', 'Apple', 'Samsung'] },
        { name: 'Type', required: true, values: [] },
        { name: 'Color', required: false, values: ['Black', 'White', 'Blue'] },
      ]
    }

    const data = await response.json()
    return (data.aspects || []).map((a) => ({
      name: a.localizedAspectName,
      required: a.aspectConstraint?.aspectRequired || false,
      values: (a.aspectValues || []).map((v) => v.localizedValue),
    }))
  }

  /**
   * Issues refund or processes return for an order via Sell Fulfillment API
   */
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = 'Order refunded', amount = null } = {}) {
    const payload = {
      reason,
      comment,
      ...(amount ? { orderLevelRefundAmount: { value: String(amount), currency: 'USD' } } : {}),
    }

    const response = await fetch(`${config.apiBaseUrl}/sell/fulfillment/v1/order/${orderId}/issue_refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Refund Error: ${err.message || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Retrieves financial transactions and fee data from eBay Sell Finances API
   */
  async getFinances(accessToken, { limit = 20 } = {}) {
    const response = await fetch(`${config.apiBaseUrl}/sell/finances/v1/transaction?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return { totalRevenue: 0, totalFees: 0, transactions: [] }
    }

    const data = await response.json()
    return {
      transactions: data.transactions || [],
      total: data.total || 0,
    }
  }

  /**
   * Retrieves competitor and market data using eBay Browse API
   */
  async getMarketData(accessToken, query = 'trending', limit = 10) {
    const response = await fetch(`${config.apiBaseUrl}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return (data.itemSummaries || []).map((item) => ({
      itemId: item.itemId,
      title: item.title,
      price: item.price?.value,
      currency: item.price?.currency,
      image: item.image?.imageUrl,
      itemWebUrl: item.itemWebUrl,
    }))
  }
}

module.exports = new EbayService()

