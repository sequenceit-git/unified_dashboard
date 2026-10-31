/**
 * eBay Marketplace Integration Service
 * Uses eBay REST APIs: Sell Fulfillment, Inventory, and OAuth 2.0
 */

const config = require('../../config/marketplaces').ebay
const trading = require('./ebayTrading')

/** eBay notices arrive as full HTML emails; this keeps the readable text. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Numeric eBay item ID; older dashboard records stored `item-<id>`. */
function ebayItemId(externalListingId) {
  const id = String(externalListingId || '').replace(/^(ebay-)?item-/, '')
  if (!/^\d{9,}$/.test(id)) {
    throw new Error('This product is not linked to a live eBay listing yet. Sync the shop or list it again.')
  }
  return id
}

class EbayService {
  /** What the List dialog shows for eBay (Trading API AddFixedPriceItem, Taxonomy API). */
  listingCapabilities = {
    canList: true,
    apiName: 'eBay Trading API',
    titleMax: 80,
    maxImages: 12,
    categorySearch: true,
    categoryAutoPick: false,
    attributes: true,
    condition: true,
    packageDetails: true,
    editAfterListing: ['title', 'description', 'price', 'stock', 'images'],
    listingActions: ['end', 'relist'],
    note: 'Shipping, returns and item location are copied from your existing eBay listings.',
  }

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
        'Accept-Language': 'en-US',
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Inventory API Error: ${err.message || response.statusText}`)
    }

    return response.json()
  }

  /** Live listings with full details, from the Trading API (includes Seller Hub listings). */
  async getListings(accessToken) {
    return trading.getActiveListings(accessToken)
  }

  /**
   * Publishes a live fixed-price listing. Location, shipping and returns are copied from one of
   * the seller's live listings. Returns `{ externalListingId: ItemID, status }`.
   */
  async createListing(accessToken, product, options = {}) {
    const opts = typeof options === 'number' ? { price: options } : { ...options }
    if (!opts.categoryId) {
      const [suggestion] = await this.getCategories(accessToken, opts.title || product.title).catch(() => [])
      opts.categoryId = suggestion?.categoryId
    }
    const { itemId } = await trading.addListing(accessToken, product, {
      ...opts,
      images: opts.images?.length ? opts.images : product.images,
      cacheKey: String(opts.shop?._id || 'default'),
    })
    return { externalListingId: itemId, status: opts.verifyOnly ? 'pending' : 'live', categoryId: opts.categoryId }
  }

  /** Changes title, description, images, price or quantity of a live listing. */
  async reviseListing(accessToken, externalListingId, changes) {
    return trading.reviseListing(accessToken, ebayItemId(externalListingId), changes)
  }

  async updateStock(accessToken, sku, quantity, options = {}) {
    return trading.reviseListing(accessToken, ebayItemId(options.externalListingId), { quantity })
  }

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    await trading.reviseListing(accessToken, ebayItemId(options.externalListingId), { price })
    return { success: true, price }
  }

  /** Puts an ended listing back on sale. `changes.quantity` is the stock to list. */
  async relistListing(accessToken, externalListingId, changes = {}) {
    return trading.relistListing(accessToken, ebayItemId(externalListingId), changes)
  }

  async applyListingAction(accessToken, action, listing) {
    const itemId = ebayItemId(listing.externalListingId)
    if (action === 'end') return trading.endListing(accessToken, itemId)
    if (action === 'relist') return trading.relistListing(accessToken, itemId)
    throw new Error(`eBay cannot ${action} a listing.`)
  }

  /**
   * Category suggestions for a title. The Taxonomy API refuses seller tokens, so this uses the app token.
   */
  async getCategories(accessToken, query = 'General') {
    const categoryTreeId = '0'
    const appToken = await this.getApplicationToken().catch(() => null)
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${appToken || accessToken}`, Accept: 'application/json' } },
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay category lookup failed: ${err.errors?.[0]?.message || response.statusText}`)
    }
    const data = await response.json()
    return (data.categorySuggestions || []).map((s) => ({
      categoryId: s.category?.categoryId,
      categoryName: s.category?.categoryName,
      path: (s.categoryTreeNodeAncestors || []).map((node) => node.categoryName).reverse().concat(s.category?.categoryName).join(' > '),
    }))
  }

  /**
   * Look up item aspects/attributes required for an eBay category
   */
  async getItemAspects(accessToken, categoryId) {
    const appToken = await this.getApplicationToken().catch(() => null)
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
      { headers: { Authorization: `Bearer ${appToken || accessToken}`, Accept: 'application/json' } },
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay item specifics lookup failed: ${err.errors?.[0]?.message || response.statusText}`)
    }
    const data = await response.json()
    return (data.aspects || [])
      .filter((a) => a.localizedAspectName !== 'Brand')
      .map((a) => ({
        id: a.localizedAspectName,
        name: a.localizedAspectName,
        required: Boolean(a.aspectConstraint?.aspectRequired),
        recommended: a.aspectConstraint?.aspectUsage === 'RECOMMENDED',
        values: (a.aspectValues || []).map((v) => v.localizedValue).slice(0, 200),
        freeText: a.aspectConstraint?.aspectMode !== 'SELECTION_ONLY',
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

  /**
   * Retrieves App (client credentials) access token for public eBay Browse API
   */
  async getApplicationToken() {
    if (!config.clientId || !config.clientSecret) return null
    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    })

    try {
      const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
        body: body.toString(),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.access_token
    } catch {
      return null
    }
  }

  /**
   * Fetches live item details including primary and additional image URLs
   * Supports both legacy 12-digit item IDs and standard REST item IDs
   */
  async getItemDetails(token, itemId) {
    if (!token || !itemId) return null
    try {
      const cleanId = String(itemId).trim()
      const url = `${config.apiBaseUrl}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(cleanId)}`
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  /**
   * Returns `{ threads, accountUsername }`. eBay messages carry usernames only, so the seller is
   * the username that appears in most member conversations.
   */
  async getInbox(accessToken, shop = {}) {
    const rows = []
    for (const conversationType of ['FROM_MEMBERS', 'FROM_EBAY']) {
      const limit = conversationType === 'FROM_MEMBERS' ? '50' : '25'
      const params = new URLSearchParams({ conversation_type: conversationType, limit, offset: '0' })
      const data = await this.ebayJson(accessToken, `/commerce/message/v1/conversation?${params}`)
      for (const row of data.conversations || []) rows.push({ row, conversationType })
    }

    const counts = {}
    for (const { row, conversationType } of rows) {
      if (conversationType !== 'FROM_MEMBERS') continue
      const latest = row.latestMessage || {}
      for (const name of new Set([latest.senderUsername, latest.recipientUsername].filter(Boolean))) {
        counts[name] = (counts[name] || 0) + 1
      }
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const detected = ranked.length > 1 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null
    const accountUsername = shop.accountUsername || detected || null

    const threads = rows.map(({ row, conversationType }) => {
      const latest = row.latestMessage || {}
      const sentAt = latest.createdDate || row.createdDate || new Date().toISOString()
      const fromEbay = conversationType === 'FROM_EBAY'
      const text = fromEbay ? row.conversationTitle || htmlToText(latest.messageBody) : latest.messageBody || ''
      const fromSeller = Boolean(accountUsername) && latest.senderUsername === accountUsername
      const buyer = fromSeller ? latest.recipientUsername : latest.senderUsername
      return {
        externalThreadId: String(row.conversationId),
        conversationType,
        replyable: !fromEbay,
        customerName: fromEbay ? 'eBay' : buyer || row.conversationTitle || '',
        status: String(row.conversationStatus || '').toUpperCase() === 'CLOSED' ? 'closed' : 'open',
        lastMessageAt: new Date(sentAt),
        lastMessagePreview: String(text).slice(0, 100),
        unreadCount: Number(row.unreadCount || 0),
        messages: text && !fromEbay ? [{
          externalMessageId: String(latest.messageId || `${row.conversationId}-latest`),
          text: String(text),
          direction: fromSeller ? 'outbound' : 'inbound',
          senderType: fromSeller ? 'agent' : 'customer',
          sentAt: new Date(sentAt),
        }] : [],
      }
    })
    return { threads, accountUsername }
  }

  /** Recent messages of one member conversation, oldest first. */
  async getThreadMessages(accessToken, shop, conversationId, { conversationType = 'FROM_MEMBERS' } = {}) {
    const accountUsername = shop?.accountUsername
    const fromEbay = conversationType === 'FROM_EBAY'
    const params = new URLSearchParams({ conversation_type: conversationType, limit: '25', offset: '0' })
    const data = await this.ebayJson(accessToken, `/commerce/message/v1/conversation/${encodeURIComponent(conversationId)}?${params}`)
    return (data.messages || [])
      .map((message) => {
        const fromSeller = !fromEbay && Boolean(accountUsername) && message.senderUsername === accountUsername
        const body = /<\w+[^>]*>/.test(message.messageBody || '') ? htmlToText(message.messageBody) : String(message.messageBody || '')
        return {
          externalMessageId: String(message.messageId),
          text: fromEbay && message.subject && !body.startsWith(message.subject) ? `${message.subject}\n\n${body}` : body,
          direction: fromSeller ? 'outbound' : 'inbound',
          senderType: fromSeller ? 'agent' : 'customer',
          sentAt: new Date(message.createdDate || Date.now()),
        }
      })
      .sort((a, b) => a.sentAt - b.sentAt)
  }

  async sendMessage(accessToken, shop, conversationId, text) {
    const data = await this.ebayJson(accessToken, '/commerce/message/v1/send_message', {
      method: 'POST',
      body: { conversationId: String(conversationId), messageText: String(text).slice(0, 2000) },
    })
    return { externalMessageId: data.messageId ? String(data.messageId) : null }
  }

  async ebayJson(accessToken, path, { method = 'GET', body } = {}) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.errors?.[0]?.message || payload.message || response.statusText
      const error = new Error(`eBay messages: ${detail}`)
      error.status = response.status
      throw error
    }
    return payload
  }
}

module.exports = new EbayService()

