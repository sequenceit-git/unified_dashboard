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

function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function categoryPath(chains) {
  return (chains || []).map((row) => row.local_name).filter(Boolean).join(' / ')
}

function toPounds(weight) {
  const value = Number(weight?.value)
  if (!Number.isFinite(value)) return null
  const unit = String(weight.unit || 'POUND').toUpperCase()
  if (unit.startsWith('KILO')) return Math.round(value * 2.20462 * 100) / 100
  if (unit === 'GRAM') return Math.round(value * 0.00220462 * 100) / 100
  return value
}

function toInches(dimensions) {
  if (!dimensions) return null
  const factor = String(dimensions.unit || 'INCH').toUpperCase().startsWith('CENT') ? 0.393701 : 1
  const num = (key) => {
    const value = Number(dimensions[key])
    return Number.isFinite(value) ? Math.round(value * factor * 100) / 100 : null
  }
  const length = num('length')
  const width = num('width')
  const height = num('height')
  if (length == null && width == null && height == null) return null
  return { length, width, height, unit: 'in' }
}

function attributeMap(rows) {
  const attributes = {}
  for (const row of rows || []) {
    const value = (row.values || []).map((item) => item.name).filter(Boolean).join(', ')
    if (row.name && value) attributes[row.name] = value
  }
  return attributes
}

function imageUrls(images) {
  const urls = []
  for (const image of images || []) {
    const url = image?.url || image?.urls?.[0] || image?.thumb_urls?.[0]
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls.slice(0, 8)
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function nextDate(value) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function amountOf(value) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  if (value.overall) return amountOf(value.overall)
  return Number(value.amount || 0)
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

  async getOrders(accessToken, { shop, limit = 100 } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const orders = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/order/202309/orders/search', {
        shop,
        query: { page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { create_time_ge: now - 365 * 24 * 3600, create_time_lt: now },
      })
      for (const order of data.orders || []) {
        orders.push({
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
        })
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && orders.length < limit)
    return { orders }
  }

  async getInventory(accessToken, { shop, limit = 200 } = {}) {
    const items = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/product/202502/products/search', {
        shop,
        query: { page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) },
        body: {},
      })
      for (const product of data.products || []) {
        let detail = product
        if (product.id) {
          try {
            detail = await this.call(accessToken, 'GET', `/product/202309/products/${product.id}`, { shop })
          } catch {
            detail = product
          }
        }
        const images = imageUrls(detail.main_images || product.main_images)
        const catalogStatus = (detail.product_status || product.status) === 'ACTIVATE' ? 'active' : 'draft'
        const skus = detail.skus?.length ? detail.skus : product.skus || []
        const attributes = attributeMap(detail.product_attributes)
        const brand = attributes.Brand || ''
        for (const sku of skus) {
          const stock = (sku.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
          items.push({
            sku: sku.seller_sku || String(sku.id),
            title: detail.title || product.title || `TikTok Shop ${sku.id}`,
            description: plainText(detail.description),
            price: Number(sku.price?.sale_price || sku.price?.tax_exclusive_price || 0),
            stock,
            images,
            category: categoryPath(detail.category_chains),
            brand,
            weight: toPounds(detail.package_weight),
            dimensions: toInches(detail.package_dimensions),
            attributes,
            status: catalogStatus,
            externalListingId: `${product.id}:${sku.id}`,
          })
        }
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && items.length < limit)
    return { inventoryItems: items }
  }

  async shopPerformance(accessToken, { shop, from, to } = {}) {
    const data = await this.call(accessToken, 'GET', '/analytics/202509/shop/performance', {
      shop,
      query: {
        start_date_ge: dateOnly(from),
        end_date_lt: nextDate(to),
        granularity: '1D',
        currency: 'USD',
      },
    })
    return data.performance?.intervals || []
  }

  async productPerformance(accessToken, { shop, from, to, limit = 10 } = {}) {
    const query = {
      start_date_ge: dateOnly(from),
      end_date_lt: nextDate(to),
      page_size: Math.min(Number(limit) || 10, 100),
      currency: 'USD',
    }
    try {
      const data = await this.call(accessToken, 'GET', '/analytics/202509/shop_products/performance', { shop, query })
      return data.products || []
    } catch (error) {
      if (!/version/i.test(error.message)) throw error
      const data = await this.call(accessToken, 'GET', '/analytics/202405/shop_products/performance', { shop, query })
      return data.products || []
    }
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
