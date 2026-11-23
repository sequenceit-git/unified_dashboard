/**
 * United States TikTok Shop Open API.
 * Paths are the newest operations in the bundled Partner Center OAS:
 * GET /authorization/202309/shops
 * POST /order/202309/orders/search
 * POST /product/202502/products/search
 * POST /product/202309/products
 * POST /product/202309/products/{product_id}/inventory/update
 * POST /product/202309/products/{product_id}/prices/update
 */
const config = require('./config')
const { signRequest } = require('./format')

class TikTokClient {
  /** What the List dialog shows for TikTok Shop (Product API 202309). */
  listingCapabilities = {
    canList: true,
    apiName: 'TikTok Shop Product API',
    titleMax: 255,
    maxImages: 9,
    categorySearch: true,
    categoryAutoPick: true,
    attributes: true,
    variants: true,
    brands: true,
    sizeChart: true,
    identifierCode: true,
    listPrice: true,
    saveModes: ['LISTING', 'AS_DRAFT'],
    condition: false,
    packageDetails: true,
    editAfterListing: ['title', 'description', 'price', 'stock', 'images'],
    listingActions: ['unpublish', 'publish', 'delete', 'recover'],
    note: 'TikTok auto-suggests a category from the title (or search to pick another). Supports variants, category attributes, brand ID, size charts, certifications, and draft or direct listing.',
  }

  getAuthUrl(state = '') {
    if (!config.serviceId) {
      throw new Error('TikTok Shop service id (TIKTOK_SHOP_SERVICE_ID) is missing')
    }
    const params = new URLSearchParams({ service_id: config.serviceId, state })
    return `${config.authUrl}?${params.toString()}`
  }

  async exchangeCode(code) {
    const token = await this.requestToken(config.tokenUrl, {
      app_key: config.appKey,
      app_secret: config.appSecret,
      auth_code: code,
      grant_type: 'authorized_code',
    })
    const shops = await this.getAuthorizedShops(token.access_token)
    const shop = shops.find((item) => item.region === 'US') || shops[0]
    if (!shop) throw new Error('TikTok Shop did not return an authorized shop')
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.access_token_expire_in,
      externalShopId: String(shop.id),
      shopCipher: shop.cipher,
      shopName: shop.name || 'TikTok Shop',
      grantedScopes: Array.isArray(token.granted_scopes) ? token.granted_scopes : undefined,
    }
  }

  async refreshToken(refreshToken) {
    const token = await this.requestToken(config.refreshUrl, {
      app_key: config.appKey,
      app_secret: config.appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.access_token_expire_in,
      grantedScopes: Array.isArray(token.granted_scopes) ? token.granted_scopes : undefined,
    }
  }

  async getWebhooks(accessToken, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', '/event/202309/webhooks', { shop })
    return data.webhooks || []
  }

  async updateWebhook(accessToken, { address, eventType, shop } = {}) {
    return this.call(accessToken, 'PUT', '/event/202309/webhooks', {
      shop,
      body: { address: String(address).slice(0, 255), event_type: eventType },
    })
  }

  async getAuthorizedShops(accessToken) {
    const data = await this.call(accessToken, 'GET', '/authorization/202309/shops', {})
    return data.shops || []
  }

  async requestToken(url, params) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TikTok Shop credentials (TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET) are missing')
    }
    const response = await fetch(`${url}?${new URLSearchParams(params)}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.code) {
      const err = new Error(payload.message || 'TikTok Shop token request failed')
      err.code = payload.code
      err.deadLogin = [105002, 105003, 36004001, 36004004, 36004005, 36004006].includes(Number(payload.code))
        || /refresh.?token|invalid.?grant|revoked|expired/i.test(payload.message || '')
      throw err
    }
    return payload.data || payload
  }

  /** Signed request. `form` sends multipart data, which TikTok leaves out of the signature. */
  async call(accessToken, method, path, { shop, query = {}, body, form } = {}) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TikTok Shop credentials (TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET) are missing')
    }
    const params = {
      app_key: config.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...query,
    }
    if (shop?.shopCipher) params.shop_cipher = shop.shopCipher
    Object.keys(params).forEach((key) => {
      if (params[key] === undefined || params[key] === null) delete params[key]
    })
    const bodyText = body === undefined || form ? '' : JSON.stringify(body)
    params.sign = signRequest(path, params, bodyText, config.appSecret)
    const url = `${config.apiBaseUrl}${path}?${new URLSearchParams(params)}`
    const response = await fetch(url, {
      method,
      headers: form
        ? { 'x-tts-access-token': accessToken }
        : { 'content-type': 'application/json', 'x-tts-access-token': accessToken },
      body: method === 'GET' ? undefined : form || bodyText,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || (payload.code && payload.code !== 0)) {
      const err = new Error(payload.message || `TikTok Shop ${path} failed`)
      err.code = payload.code
      err.status = (response.status === 401
        || [105002, 105003, 105004, 36004004, 36004005].includes(Number(payload.code))
        || /access.?token|token.*(expired|invalid)/i.test(payload.message || ''))
        ? 401
        : response.status
      throw err
    }
    return payload.data || {}
  }
}

module.exports = { TikTokClient }
