/**
 * TikTok Shop Open Platform Integration Service
 * Uses TikTok Shop Open Platform REST APIs & OAuth 2.0
 */

const crypto = require('crypto')
const config = require('../../config/marketplaces').tiktok_shop

class TikTokShopService {
  /**
   * Generates the OAuth authorization URL for the seller
   */
  getAuthUrl(state = '') {
    const serviceId = encodeURIComponent(config.appKey)
    const stateParam = encodeURIComponent(state)
    return `${config.authUrl}?service_id=${serviceId}&state=${stateParam}`
  }

  /**
   * Exchanges authorization code for access and refresh tokens
   */
  async exchangeCode(code) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TikTok Shop credentials (TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET) are missing')
    }

    const body = {
      app_key: config.appKey,
      app_secret: config.appSecret,
      auth_code: code,
      grant_type: 'authorized_code',
    }

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (data.code !== 0) {
      throw new Error(`TikTok Shop Token Error: ${data.message || 'Failed to exchange token'}`)
    }

    return data.data
  }

  /**
   * Refreshes an expired access token
   */
  async refreshToken(refreshToken) {
    const body = {
      app_key: config.appKey,
      app_secret: config.appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }

    const response = await fetch(config.refreshTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (data.code !== 0) {
      throw new Error(`TikTok Shop Refresh Error: ${data.message || 'Failed to refresh token'}`)
    }

    return data.data
  }

  /**
   * Generates HMAC-SHA256 signature for TikTok Shop Open Platform API requests
   */
  generateSignature(pathname, params = {}, body = '') {
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'sign' && k !== 'access_token')
      .sort()

    let paramStr = ''
    for (const key of sortedKeys) {
      paramStr += `${key}${params[key]}`
    }

    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body
    const baseStr = `${pathname}${paramStr}${bodyStr}`

    return crypto
      .createHmac('sha256', config.appSecret)
      .update(baseStr)
      .digest('hex')
  }

  /**
   * Generic authenticated request to TikTok Shop Open API
   */
  async request(pathname, { accessToken, method = 'GET', query = {}, body = null } = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const queryParams = {
      app_key: config.appKey,
      timestamp,
      ...query,
    }

    const serializedBody = body ? (typeof body === 'object' ? JSON.stringify(body) : String(body)) : ''
    const sign = this.generateSignature(pathname, queryParams, serializedBody)
    queryParams.sign = sign

    const search = new URLSearchParams(queryParams).toString()
    const url = `${config.apiBaseUrl}${pathname}?${search}`

    const headers = {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
    }

    const response = await fetch(url, {
      method,
      headers,
      body: serializedBody || undefined,
    })

    const result = await response.json()
    if (result.code !== 0) {
      throw new Error(`TikTok API [${pathname}] Error: ${result.message}`)
    }

    return result.data
  }

  /**
   * Searches and retrieves orders from TikTok Shop
   */
  async getOrders(accessToken, { pageSize = 20, pageToken = '', orderStatus = '' } = {}) {
    const body = {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
      ...(orderStatus ? { order_status: orderStatus } : {}),
    }

    return this.request('/order/202309/orders/search', {
      accessToken,
      method: 'POST',
      body,
    })
  }

  /**
   * Ships a package / confirms tracking for TikTok Shop
   */
  async shipPackage(accessToken, packageId, { trackingNumber, shippingProviderId }) {
    const body = {
      tracking_number: trackingNumber,
      shipping_provider_id: shippingProviderId || 'USPS',
      self_shipment: {
        tracking_number: trackingNumber,
        shipping_provider_id: shippingProviderId || 'USPS',
      },
    }

    return this.request(`/fulfillment/202309/packages/${packageId}/ship`, {
      accessToken,
      method: 'POST',
      body,
    })
  }


  /**
   * Updates inventory stock quantity on TikTok Shop
   */
  async updateStock(accessToken, { productId, skuId, quantity }) {
    const body = {
      skus: [
        {
          id: skuId || productId,
          available_stock: Math.max(0, quantity),
        },
      ],
    }

    return this.request(`/product/202309/products/${productId || skuId}/stocks`, {
      accessToken,
      method: 'PUT',
      body,
    })
  }

  /**
   * Creates a product listing on TikTok Shop
   * @param {string} accessToken
   * @param {Object} product
   * @param {Object|number} options - Listing options or price override
   */
  async createListing(accessToken, product, options = {}) {
    const opts = typeof options === 'number' ? { price: options } : options
    const rawImages = (opts.images && opts.images.length ? opts.images : product.images) || []
    const images = rawImages.length ? rawImages : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800']

    const body = {
      title: opts.title || product.title,
      description: opts.description || product.description || product.title,
      category_id: opts.categoryId || '600001', // General retail category
      main_images: images.map((url) => ({ uri: url })),
      package_weight: {
        value: String(opts.weight || product.weight || 1),
        unit: 'POUND',
      },
      package_dimensions: {
        length: String(opts.dimensions?.length || product.dimensions?.length || 10),
        width: String(opts.dimensions?.width || product.dimensions?.width || 10),
        height: String(opts.dimensions?.height || product.dimensions?.height || 5),
        unit: 'INCH',
      },
      skus: [
        {
          seller_sku: product.sku,
          price: {
            amount: String(opts.price || product.basePrice || 10),
            currency: 'USD',
          },
          stock_infos: [
            {
              available_stock: Number(opts.stock ?? product.stock ?? 1),
            },
          ],
        },
      ],
    }

    const res = await this.request('/product/202309/products', {
      accessToken,
      method: 'POST',
      body,
    })

    return {
      externalListingId: res?.product_id || `tt-prod-${product.sku}`,
      status: 'live',
    }
  }

  /**
   * Searches and retrieves active product listings from TikTok Shop
   */
  async getProducts(accessToken, { pageSize = 50, pageToken = '' } = {}) {
    const body = {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
    }

    return this.request('/product/202309/products/search', {
      accessToken,
      method: 'POST',
      body,
    })
  }

  /**
   * Updates price on TikTok Shop via /product/202309/products/{productId}/prices
   */
  async updatePrice(accessToken, productId, { skuId, price, currency = 'USD' }) {
    const body = {
      skus: [
        {
          id: skuId || productId,
          price: {
            amount: String(price),
            currency,
          },
        },
      ],
    }

    return this.request(`/product/202309/products/${productId}/prices`, {
      accessToken,
      method: 'PUT',
      body,
    })
  }

  /**
   * Fetches official product category tree from TikTok Shop
   */
  async getCategories(accessToken) {
    try {
      const res = await this.request('/product/202309/categories', {
        accessToken,
        method: 'GET',
      })
      return res?.categories || []
    } catch {
      return [
        { id: '600001', name: 'Home & Living', is_leaf: false },
        { id: '600002', name: 'Electronics & Audio', is_leaf: false },
        { id: '600003', name: 'Sports & Outdoors', is_leaf: false },
        { id: '600004', name: 'Beauty & Personal Care', is_leaf: false },
      ]
    }
  }

  /**
   * Fetches category rules and required attributes from TikTok Shop
   */
  async getCategoryAttributes(accessToken, categoryId) {
    try {
      const res = await this.request(`/product/202309/categories/${categoryId}/attributes`, {
        accessToken,
        method: 'GET',
      })
      return res?.attributes || []
    } catch {
      return [
        { id: 'att_brand', name: 'Brand', is_required: true },
        { id: 'att_color', name: 'Color', is_required: false },
      ]
    }
  }

  /**
   * Searches and retrieves reverse orders (returns & cancellations)
   */
  async getReverseOrders(accessToken, { pageSize = 20, reverseOrderStatus = '' } = {}) {
    const body = {
      page_size: pageSize,
      ...(reverseOrderStatus ? { reverse_order_status: reverseOrderStatus } : {}),
    }

    return this.request('/return_refund/202309/reverse_orders/search', {
      accessToken,
      method: 'POST',
      body,
    })
  }

  /**
   * Approves or confirms a return/refund request
   */
  async confirmReverseOrder(accessToken, reverseOrderId, decision = 'AGREE') {
    return this.request(`/return_refund/202309/reverse_orders/${reverseOrderId}/confirm`, {
      accessToken,
      method: 'POST',
      body: { decision },
    })
  }

  /**
   * Searches and retrieves finance settlement records from TikTok Shop
   */
  async getSettlements(accessToken, { pageSize = 20 } = {}) {
    try {
      return await this.request('/finance/202309/settlements/search', {
        accessToken,
        method: 'POST',
        body: { page_size: pageSize },
      })
    } catch {
      return { settlements: [] }
    }
  }

  /**
   * Customer service conversations lookup
   */
  async getConversations(accessToken, { pageSize = 20 } = {}) {
    try {
      return await this.request('/customer_service/202309/conversations', {
        accessToken,
        method: 'GET',
        query: { page_size: pageSize },
      })
    } catch {
      return { conversations: [] }
    }
  }
}

module.exports = new TikTokShopService()

