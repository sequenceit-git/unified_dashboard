/**
 * United States Temu local-seller Open API.
 * One POST router. Documented types used here:
 * bg.open.accesstoken.create
 * bg.order.list.v2.get
 * bg.local.goods.list.query
 */

const crypto = require('crypto')
const config = require('../../config/marketplaces').temu

const ORDER_STATUS = {
  1: 'pending',
  2: 'paid',
  3: 'cancelled',
  4: 'shipped',
  5: 'delivered',
}

class TemuService {
  /** Temu goods create and edit calls are not wired yet, so listing is read-only here. */
  listingCapabilities = {
    canList: false,
    apiName: 'Temu Open API',
    editAfterListing: [],
    note: 'Listing on Temu from EcomPilot is not available yet. Create the product in Temu Seller Center; it will sync here.',
  }

  getAuthUrl(state = '') {
    if (!config.appKey) throw new Error('Temu app key (TEMU_APP_KEY) is missing')
    const params = new URLSearchParams({
      appKey: config.appKey,
      redirect_uri: config.redirectUri,
      state,
    })
    return `${config.authUrl}?${params.toString()}`
  }

  async exchangeCode(code) {
    const result = await this.call('bg.open.accesstoken.create', {
      access_token: code,
      code,
    })
    const token = result.accessToken || result.access_token
    const mallId = result.mallId || result.mall_id
    if (!token) throw new Error('Temu did not return an access token')
    return {
      access_token: token,
      expires_in: result.expiredTime || result.expires_in,
      externalShopId: mallId ? String(mallId) : `temu-${Date.now()}`,
      shopName: result.mallName || 'Temu Shop',
    }
  }

  async refreshToken() {
    throw new Error('Temu US local tokens are reissued from Seller Center authorization')
  }

  async getOrders(accessToken, { limit = 50 } = {}) {
    const result = await this.call('bg.order.list.v2.get', {
      access_token: accessToken,
      pageNumber: 1,
      pageSize: Math.min(limit, 100),
    })
    const rows = result.pageItems || result.orderList || result.parentOrderList || []
    return {
      orders: rows.map((row) => {
        const parent = row.parentOrderMap || row
        const lines = row.orderList || parent.orderList || []
        return {
          externalOrderId: parent.parentOrderSn || parent.orderSn || parent.parentOrderId,
          placedAt: parent.parentOrderTime ? new Date(Number(parent.parentOrderTime) * 1000) : new Date(),
          status: ORDER_STATUS[parent.parentOrderStatus] || 'pending',
          buyer: { name: parent.receiptName || 'Temu customer', email: '' },
          totals: {
            total: Number(parent.amount || parent.parentOrderAmount || 0),
            currency: 'USD',
          },
          items: lines.map((line) => ({
            sku: line.extCode || line.skuId || line.goodsId,
            title: line.goodsName || line.spec || 'Temu item',
            quantity: Number(line.quantity || 1),
            unitPrice: Number(line.price || 0),
          })),
        }
      }).filter((order) => order.externalOrderId),
    }
  }

  async getInventory(accessToken, { limit = 50 } = {}) {
    const result = await this.call('bg.local.goods.list.query', {
      access_token: accessToken,
      pageNo: 1,
      pageSize: Math.min(limit, 100),
      goodsSearchType: 1,
      goodsStatusFilterType: 1,
    })
    const goods = result.goodsList || result.pageItems || result.list || []
    const items = []
    for (const good of goods) {
      const skus = good.skuList || good.skuInfoList || [good]
      for (const sku of skus) {
        items.push({
          sku: sku.outSkuSn || sku.outGoodsSn || good.outGoodsSn || String(sku.skuId || good.goodsId),
          title: good.goodsName || sku.goodsName || 'Temu goods',
          description: '',
          price: Number(sku.retailPrice?.amount || good.retailPrice?.amount || sku.price || 0),
          stock: Number(sku.quantity || sku.stock || good.quantity || 0),
          images: [good.thumbUrl || good.imageUrl].filter(Boolean),
          category: '',
          brand: '',
          externalListingId: String(good.goodsId || sku.goodsId || sku.skuId),
        })
      }
    }
    return { inventoryItems: items, complete: goods.length < Math.min(limit, 100) }
  }

  async createListing() {
    throw new Error('Temu listing publish uses the US Partner goods create API. Confirm the type in partner-us before sending a product.')
  }

  async updateStock() {
    throw new Error('Temu stock edit type must be taken from the US Partner goods API list before pushing stock.')
  }

  async updatePrice() {
    throw new Error('Temu price edit type must be taken from the US Partner goods API list before pushing a price.')
  }

  async call(type, business) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('Temu credentials (TEMU_APP_KEY, TEMU_APP_SECRET) are missing')
    }
    const payload = {
      type,
      app_key: config.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      data_type: 'JSON',
      ...business,
    }
    payload.sign = sign(payload, config.appSecret)
    const response = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.success === false) {
      throw new Error(body.errorMsg || body.error_msg || `Temu ${type} failed`)
    }
    return body.result || body
  }
}

function sign(payload, secret) {
  const text = Object.keys(payload)
    .filter((key) => key !== 'sign' && payload[key] !== undefined && payload[key] !== null)
    .sort()
    .map((key) => `${key}${stringify(payload[key])}`)
    .join('')
  return crypto.createHash('md5').update(`${secret}${text}${secret}`).digest('hex').toUpperCase()
}

function stringify(value) {
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

module.exports = new TemuService()
