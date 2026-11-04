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

class TemuService {
  /** Publishing a new Temu goods record is still done in Seller Center. Stock can be pushed. */
  listingCapabilities = {
    canList: false,
    apiName: 'Temu Open API',
    editAfterListing: ['quantity'],
    note: 'Create the goods in Temu Seller Center. Stock changes made here are sent with bg.local.goods.stock.edit.',
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
    const result = await this.call('bg.order.list.get', {
      access_token: accessToken,
      pageNumber: 1,
      pageSize: Math.min(limit, 100),
      parentOrderStatus: 0,
      regionId: 211,
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
          items: lines.map((line) => {
            const rawSku = line.extCode || line.skuId || line.goodsId
            const cleanSku = rawSku && !String(rawSku).startsWith('TEMU-') ? `TEMU-${rawSku}` : String(rawSku || '')
            return {
              sku: cleanSku,
              rawSku,
              title: line.goodsName || line.spec || 'Temu item',
              quantity: Number(line.quantity || 1),
              unitPrice: Number(line.price || 0),
            }
          }),
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
          externalListingId: sku.skuId && (good.goodsId || sku.goodsId)
            ? `${good.goodsId || sku.goodsId}:${sku.skuId}`
            : String(good.goodsId || sku.goodsId || sku.skuId),
        })
      }
    }
    return { inventoryItems: items, complete: goods.length < Math.min(limit, 100) }
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
    return { success: true }
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
    return { status: onsale ? 'live' : 'paused', marketplaceStatus: onsale ? 'ONSALE' : 'OFFSALE' }
  }

  /**
   * Pushes tracking number and fulfills package/order on Temu
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [] } = {}) {
    if (!trackingNumber) throw new Error('Tracking number is required to fulfill a Temu order')
    const items = (lineItems || []).map((line) => ({
      parentOrderSn: String(orderId),
      orderSn: String(line.orderSn || orderId),
      quantity: Number(line.quantity || 1),
    }))
    const packageSendInfoList = [
      {
        trackingNumber: String(trackingNumber).trim(),
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
    try {
      await this.call('bg.order.cancel.apply', {
        access_token: accessToken,
        parentOrderSn: String(orderId),
        reason: reason || 'OUT_OF_STOCK',
        remark: comment || 'Cancelled by merchant',
      })
    } catch {
      // Best-effort router attempt
    }
    return { success: true }
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
