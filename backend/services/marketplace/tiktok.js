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

const crypto = require('crypto')
const config = require('../../config/marketplaces').tiktok_shop

const ORDER_STATUS = {
  UNPAID: 'pending',
  ON_HOLD: 'processing',
  AWAITING_SHIPMENT: 'paid',
  AWAITING_COLLECTION: 'processing',
  PARTIALLY_SHIPPING: 'processing',
  IN_TRANSIT: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
}

class TikTokShopService {
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
    }
  }

  async getOrders(accessToken, { shop, limit = 50 } = {}) {
    const data = await this.call(accessToken, 'POST', '/order/202309/orders/search', {
      shop,
      query: { page_size: Math.min(limit, 100) },
      body: {},
    })
    return {
      orders: (data.orders || []).map((order) => ({
        externalOrderId: order.id,
        placedAt: order.create_time ? new Date(order.create_time * 1000) : new Date(),
        status: ORDER_STATUS[order.status] || 'pending',
        buyer: { name: order.recipient_address?.name || order.user_id || 'TikTok Shop customer', email: '' },
        totals: {
          total: Number(order.payment?.total_amount || 0),
          currency: order.payment?.currency || 'USD',
        },
        items: (order.line_items || []).map((item) => ({
          sku: item.seller_sku || item.sku_id,
          title: item.product_name || item.sku_name,
          quantity: 1,
          unitPrice: Number(item.sale_price || 0),
          externalListingId: item.product_id ? `${item.product_id}:${item.sku_id || ''}` : undefined,
        })),
      })),
    }
  }

  async getInventory(accessToken, { shop, limit = 50 } = {}) {
    const data = await this.call(accessToken, 'POST', '/product/202502/products/search', {
      shop,
      query: { page_size: Math.min(limit, 100) },
      body: { status: 'ACTIVATE' },
    })
    const items = []
    for (const product of data.products || []) {
      const images = (product.main_images || []).map((image) => image.url || image.urls?.[0]).filter(Boolean)
      for (const sku of product.skus || []) {
        const stock = (sku.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
        items.push({
          sku: sku.seller_sku || String(sku.id),
          title: product.title || `TikTok Shop ${sku.id}`,
          description: product.description || '',
          price: Number(sku.price?.sale_price || sku.price?.tax_exclusive_price || 0),
          stock,
          images,
          category: 'General',
          brand: 'TikTok Shop',
          externalListingId: `${product.id}:${sku.id}`,
        })
      }
    }
    return { inventoryItems: items }
  }

  async createListing(accessToken, product, options = {}) {
    if (!options.categoryId) {
      throw new Error('TikTok Shop listing requires a category id from Product categories')
    }
    const shop = options.shop
    return this.call(accessToken, 'POST', '/product/202309/products', {
      shop,
      body: {
        title: options.title || product.title,
        description: product.description || product.title,
        category_id: options.categoryId,
        main_images: (product.images || []).slice(0, 9).map((uri) => ({ uri })),
        package_weight: { value: String(options.weight || product.weight || 1), unit: 'POUND' },
        skus: [
          {
            seller_sku: product.sku,
            price: { amount: String(options.price || product.basePrice || 0), currency: 'USD' },
            inventory: [{ quantity: Number(product.stock || 0) }],
          },
        ],
      },
    })
  }

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [productId, skuId] = String(options.externalListingId || '').split(':')
    if (!productId || !skuId) {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }
    return this.call(accessToken, 'POST', `/product/202309/products/${productId}/inventory/update`, {
      shop: options.shop,
      body: { skus: [{ id: skuId, inventory: [{ quantity: Number(quantity) }] }] },
    })
  }

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [productId, skuId] = String(options.externalListingId || '').split(':')
    if (!productId || !skuId) {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    return this.call(accessToken, 'POST', `/product/202309/products/${productId}/prices/update`, {
      shop: options.shop,
      body: { skus: [{ id: skuId, price: { amount: String(price), currency } }] },
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
      throw new Error(payload.message || 'TikTok Shop token request failed')
    }
    return payload.data || payload
  }

  async call(accessToken, method, path, { shop, query = {}, body } = {}) {
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
    const bodyText = body === undefined ? '' : JSON.stringify(body)
    params.sign = signRequest(path, params, bodyText, config.appSecret)
    const url = `${config.apiBaseUrl}${path}?${new URLSearchParams(params)}`
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-tts-access-token': accessToken,
      },
      body: method === 'GET' ? undefined : bodyText,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || (payload.code && payload.code !== 0)) {
      throw new Error(payload.message || `TikTok Shop ${path} failed`)
    }
    return payload.data || {}
  }
}

function signRequest(path, params, bodyText, secret) {
  const pairs = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
  return crypto.createHmac('sha256', secret).update(`${secret}${path}${pairs}${bodyText}${secret}`).digest('hex')
}

module.exports = new TikTokShopService()
