/**
 * United States Temu local-seller Open API.
 * One POST router. Documented types used here:
 * bg.open.accesstoken.create
 * bg.order.list.get
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

/** Temu sends seconds or milliseconds. */
function temuDate(value) {
  const n = Number(value)
  if (!n) return new Date()
  return new Date(n > 1e12 ? n : n * 1000)
}

/** Temu money is either a number/string or `{ amount, currency }`. */
function temuMoney(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'object') return Number(value.amount) || 0
  return Number(value) || 0
}

class TemuService {
  /** Publishing a new Temu goods record is still done in Seller Center. Stock can be pushed. */
  listingCapabilities = {
    canList: false,
    apiName: 'Temu Open API',
    editAfterListing: ['quantity'],
    note: 'Create the goods in Temu Seller Center. Stock changes made here are sent with bg.local.goods.stock.edit.',
  }

  /** bg.local.goods.list.query is filtered to goods on sale, so an off-sale (paused) goods missing from it is not ended. */
  endableStatuses = ['live', 'out_of_stock']

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
    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const orders = []
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      const result = await this.call('bg.order.list.get', {
        access_token: accessToken,
        pageNumber,
        pageSize,
        parentOrderStatus: 0,
        regionId: 211,
      })
      const rows = result.pageItems || result.orderList || result.parentOrderList || []
      for (const row of rows) {
        const parent = row.parentOrderMap || row
        const lines = row.orderList || parent.orderList || []
        orders.push({
          externalOrderId: parent.parentOrderSn || parent.orderSn || parent.parentOrderId,
          placedAt: parent.parentOrderTime ? temuDate(parent.parentOrderTime) : new Date(),
          status: ORDER_STATUS[parent.parentOrderStatus] || 'pending',
          buyer: { name: parent.receiptName || 'Temu customer', email: '' },
          totals: {
            total: temuMoney(parent.amount || parent.parentOrderAmount),
            currency: 'USD',
          },
          items: lines.map((line) => {
            const goodsId = line.goodsId || parent.goodsId
            const skuId = line.skuId
            const rawSku = String(line.extCode || line.outSkuSn || '').trim()
            return {
              sku: rawSku || String(skuId || goodsId || ''),
              rawSku,
              lineItemId: line.orderSn ? String(line.orderSn) : undefined,
              externalListingId: goodsId && skuId ? `${goodsId}:${skuId}` : undefined,
              title: line.goodsName || line.spec || 'Temu item',
              quantity: Number(line.quantity || 1),
              unitPrice: temuMoney(line.price),
            }
          }),
        })
      }
      if (rows.length < pageSize || orders.length >= limit) break
    }
    return { orders: orders.filter((order) => order.externalOrderId) }
  }

  async getInventory(accessToken, { limit = 50 } = {}) {
    const pageSize = 100
    const maxPages = 20
    const goods = []
    let complete = true
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const result = await this.call('bg.local.goods.list.query', {
        access_token: accessToken,
        pageNo,
        pageSize,
        goodsSearchType: 1,
        goodsStatusFilterType: 1,
      })
      const page = result.goodsList || result.pageItems || result.list || []
      goods.push(...page)
      if (page.length < pageSize) break
      if (pageNo === maxPages) complete = false
    }
    const items = []
    for (const good of goods) {
      const skus = good.skuList || good.skuInfoList || [good]
      for (const sku of skus) {
        const rawSku = String(sku.outSkuSn || sku.outGoodsSn || good.outGoodsSn || '').trim()
        items.push({
          sku: rawSku || String(sku.skuId || good.goodsId),
          rawSku,
          title: good.goodsName || sku.goodsName || 'Temu goods',
          description: '',
          price: temuMoney(sku.retailPrice ?? good.retailPrice ?? sku.price),
          stock: Number(sku.quantity || sku.stock || good.quantity || 0),
          images: [good.thumbUrl || good.imageUrl].filter(Boolean),
          category: '',
          brand: '',
          listingStatus: 'live',
          marketplaceStatus: 'ONSALE',
          externalListingId: sku.skuId && (good.goodsId || sku.goodsId)
            ? `${good.goodsId || sku.goodsId}:${sku.skuId}`
            : String(good.goodsId || sku.goodsId || sku.skuId),
        })
      }
    }
    return { inventoryItems: items, complete }
  }

  async createListing() {
    throw new Error('Temu listing publish uses the US Partner goods create API. Confirm the type in partner-us before sending a product.')
  }

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [goodsId, skuId] = String(options.externalListingId || '').split(':')
    if (!goodsId || !skuId) throw new Error('Sync this Temu goods again so the SKU id is saved, then update stock.')
    const target = Math.max(0, Math.floor(Number(quantity)))
    const result = await this.call('bg.local.goods.stock.edit', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      skuStockTargetList: [{ skuId: Number(skuId), stockTarget: target }],
    })
    const info = (result.skuStockEditStatusInfoList || []).find((row) => String(row.skuId) === String(skuId))
    if (result.operateResult === false || info?.stockEditStatus === false) {
      throw new Error(info?.errorMsg || result.msg || 'Temu could not update this SKU stock.')
    }
    return { success: true }
  }

  async reviseListing(accessToken, externalListingId, changes) {
    if (changes.quantity != null) await this.updateStock(accessToken, null, changes.quantity, { externalListingId })
    // Temu price changes go through Seller Center price review; text and images are edited there too.
    const skipped = ['price', 'title', 'description', 'images'].filter((key) => changes[key] != null && changes[key] !== '')
    return { success: true, ...(skipped.length ? { skipped } : {}) }
  }

  async applyListingAction(accessToken, action, listing) {
    const goodsId = String(listing.externalListingId || '').split(':')[0]
    if (!goodsId) throw new Error('This product is not on Temu yet.')
    const onsale = action === 'publish' ? 1 : action === 'unpublish' ? 0 : null
    if (onsale == null) throw new Error(`Temu cannot ${action} a listing.`)
    const result = await this.call('bg.local.goods.sale.status.set', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      onsale,
    })
    if (result?.success === false) throw new Error('Temu could not change the sale status.')
    return {
      status: onsale ? (Number(listing.stock) > 0 ? 'live' : 'out_of_stock') : 'paused',
      marketplaceStatus: onsale ? 'ONSALE' : 'OFFSALE',
    }
  }

  /**
   * Pushes tracking number and fulfills package/order on Temu
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [] } = {}) {
    const cleanTracking = String(trackingNumber || '').trim().replace(/[\s-]+/g, '')
    if (!cleanTracking) throw new Error('Tracking number is required to fulfill a Temu order')
    const items = (lineItems || []).map((line) => ({
      parentOrderSn: String(orderId),
      orderSn: String(line.lineItemId || line.orderSn || orderId),
      quantity: Number(line.quantity || 1),
    }))
    const packageSendInfoList = [
      {
        trackingNumber: cleanTracking,
        packageDetail: items.length ? items : [{ parentOrderSn: String(orderId), quantity: 1 }],
      },
    ]
    const result = await this.call('bg.logistics.shipped.package.confirm', {
      access_token: accessToken,
      packageSendInfoList,
    })
    return result || { success: true }
  }

  /**
   * Cancels unfulfilled order on Temu
   */
  async cancelOrder(accessToken, orderId, { reason = 'OUT_OF_STOCK', comment = '' } = {}) {
    const result = await this.call('bg.order.cancel.apply', {
      access_token: accessToken,
      parentOrderSn: String(orderId),
      reason: reason || 'OUT_OF_STOCK',
      remark: comment || 'Cancelled by merchant',
    })
    return result || { success: true }
  }

  /**
   * Issues refund on Temu
   */
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = '', amount } = {}) {
    const result = await this.call('temu.aftersales.refund.issue', {
      access_token: accessToken,
      parentOrderSn: String(orderId),
      reason,
      remark: comment || 'Refund processed',
      ...(amount ? { refundAmount: Number(amount) } : {}),
    })
    return result || { success: true }
  }

  /**
   * Approves or resolves an aftersales return/refund request on Temu
   */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE', comments = '' } = {}) {
    const isApprove = /approve/i.test(decision)
    if (isApprove) {
      return this.call('temu.aftersales.refund.issue', {
        access_token: accessToken,
        parentAfterSalesSn: String(returnId),
        remark: comments || 'Refund approved by merchant',
      })
    }
    return this.call('temu.aftersales.claim.reject', {
      access_token: accessToken,
      parentAfterSalesSn: String(returnId),
      rejectReason: comments || 'Claim rejected by merchant',
    })
  }

  /**
   * Approves or rejects an order cancellation request on Temu
   */
  async decideCancellation(accessToken, cancelId, { action = 'approve', comment = '' } = {}) {
    const isApprove = String(action).toLowerCase() === 'approve'
    return this.decideReturn(accessToken, cancelId, { decision: isApprove ? 'APPROVE' : 'REJECT', comments: comment })
  }

  /**
   * Updates SKU price on Temu
   */
  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [goodsId, skuId] = String(options.externalListingId || '').split(':')
    if (!goodsId || !skuId) {
      throw new Error(`Temu price update needs a synced goods and SKU for ${sku}`)
    }
    const result = await this.call('bg.local.goods.priceorder.change.sku.price', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      skuPriceList: [
        {
          skuId: Number(skuId),
          price: Number(price),
          currency: currency || 'USD',
        },
      ],
    })
    return result || { success: true }
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
      const err = new Error(body.errorMsg || body.error_msg || `Temu ${type} failed`)
      err.code = body.errorCode ?? body.error_code
      throw err
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
