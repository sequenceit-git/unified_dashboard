/**
 * United States Temu local-seller Open API.
 * One POST router; every call is `call(type, params)`. Orders: bg.order.list.v2.get,
 * bg.order.shippinginfo.v2.get, bg.order.amount.query. Shipping: bg.logistics.shipment.v2.confirm.
 * Cancel: temu.order.cancel.outofstock.apply. After-sales: bg.aftersales.*, temu.aftersales.refund.issue.
 * Goods: bg.local.goods.*. Webhooks: see services/temuNotifications.js.
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

/** Buyer address from bg.order.shippinginfo.v2.get (regionName1-4 = country, state, city, district). */
function temuAddress(info) {
  if (!info || typeof info !== 'object') return undefined
  const street = [info.addressLine1, info.addressLine2, info.addressLine3].filter(Boolean).join(', ') || info.addressLineAll || ''
  const address = {
    street,
    city: info.regionName3 || '',
    state: info.regionName2 || '',
    zip: info.postCode || '',
    country: info.regionName1 || 'US',
  }
  return address.street || address.city || address.zip ? address : undefined
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
      const result = await this.call('bg.order.list.v2.get', {
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
        const addr = parent.shippingAddress || parent.address || parent.receiptAddress || parent
        const shippingAddress = (addr.addressLine1 || addr.address1 || addr.street || addr.city || addr.state || addr.postalCode || addr.zip || addr.country)
          ? {
              street: addr.addressLine1 || addr.address1 || addr.street || '',
              city: addr.city || addr.regionName3 || '',
              state: addr.state || addr.province || addr.regionName2 || '',
              zip: addr.postalCode || addr.zip || addr.postCode || '',
              country: addr.country || addr.regionShortName || 'US',
            }
          : undefined
        const firstLine = lines[0] || {}
        const trackingNumber = parent.trackingNumber || firstLine.trackingNumber || parent.waybillSn || ''
        const carrier = parent.shippingCompanyName || parent.carrierName || firstLine.shippingCompanyName || ''
        const shipping = (trackingNumber || carrier || parent.shippingTime || parent.deliveryTime)
          ? {
              ...(carrier ? { carrier } : {}),
              ...(trackingNumber ? { trackingNumber: String(trackingNumber) } : {}),
              ...(parent.shippingTime ? { shippedAt: temuDate(parent.shippingTime) } : {}),
              ...(parent.deliveryTime ? { deliveredAt: temuDate(parent.deliveryTime) } : {}),
            }
          : undefined
        orders.push({
          externalOrderId: parent.parentOrderSn || parent.orderSn || parent.parentOrderId,
          placedAt: parent.parentOrderTime ? temuDate(parent.parentOrderTime) : new Date(),
          status: ORDER_STATUS[parent.parentOrderStatus] || 'pending',
          buyer: {
            name: parent.receiptName || 'Temu customer',
            email: '',
            phone: parent.receiptPhone || parent.mobile || parent.shippingAddress?.phone || '',
          },
          ...(shippingAddress ? { shippingAddress } : {}),
          ...(shipping ? { shipping } : {}),
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
    const found = orders.filter((order) => order.externalOrderId)
    await this.fillOrderDetails(accessToken, found)
    return { orders: found }
  }

  /**
   * The order list can leave out the buyer address and amounts. Orders still to ship get their
   * address from bg.order.shippinginfo.v2.get, and orders without a total get it from
   * bg.order.amount.query. Each order is asked at most once per few hours, and a sync makes at
   * most `maxCalls` of these calls.
   */
  async fillOrderDetails(accessToken, orders, { maxCalls = 20 } = {}) {
    const cache = require('../cache')
    let calls = 0
    for (const order of orders) {
      if (calls >= maxCalls) break
      const sn = order.externalOrderId
      if (!order.shippingAddress && ['pending', 'paid'].includes(order.status) && await cache.claim(`temu:addr:${sn}`, 6 * 3600)) {
        calls += 1
        try {
          const info = await this.call('bg.order.shippinginfo.v2.get', { access_token: accessToken, parentOrderSn: sn })
          const address = temuAddress(info)
          if (address) order.shippingAddress = address
          if (info?.receiptName && (!order.buyer.name || order.buyer.name === 'Temu customer')) order.buyer.name = info.receiptName
          if (info?.mobile && !order.buyer.phone) order.buyer.phone = String(info.mobile)
          if (info?.mail && !order.buyer.email) order.buyer.email = String(info.mail)
        } catch (err) {
          // 180020008: the seller has not signed Temu's data agreement (DPA) yet.
          if (String(err.code) === '180020008') calls = maxCalls
        }
      }
      if (calls < maxCalls && !order.totals.total && await cache.claim(`temu:amt:${sn}`, 24 * 3600)) {
        calls += 1
        try {
          const amounts = await this.call('bg.order.amount.query', { access_token: accessToken, parentOrderSn: sn })
          const parent = amounts?.parentOrderMap || {}
          const paid = parent.customerPaid || parent.retailPriceTotalTaxIncl || parent.retailPriceTotal
          const total = temuMoney(paid)
          if (total) order.totals = { total, currency: paid?.currency || order.totals.currency || 'USD' }
          const lines = new Map((amounts?.orderList || []).map((line) => [String(line.orderSn), line]))
          for (const item of order.items) {
            const line = lines.get(String(item.lineItemId))
            const unit = temuMoney(line?.unitRetailPrice || line?.unitRetailPriceVatIncl)
            if (!item.unitPrice && unit) item.unitPrice = unit
          }
        } catch {
          // 140020008: amounts are still being calculated; the next try is after the claim expires.
        }
      }
    }
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

  async resolveCarrierId(accessToken, carrier) {
    const needle = String(carrier || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!needle || needle === 'other') return null
    this._carrierCache = this._carrierCache || { at: 0, list: [] }
    if (!this._carrierCache.list.length || Date.now() - this._carrierCache.at > 15 * 60 * 1000) {
      const res = await this.call('bg.logistics.companies.get', { access_token: accessToken, regionId: 211 })
      const list = res.shippingCompanyList || res.logisticsServiceProviderList || Object.values(res).find(Array.isArray) || []
      this._carrierCache = { at: Date.now(), list }
    }
    const match = this._carrierCache.list.find((row) => {
      const name = String(row.shippingCompanyName || row.logisticsServiceProviderName || row.carrierName || row.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      return name && (name === needle || name.includes(needle) || needle.includes(name))
    })
    return match?.shippingCompanyId ?? match?.logisticsServiceProviderId ?? match?.carrierId ?? match?.id ?? null
  }

  /** The shop's default self-shipping warehouse, if it has one (cached 15 minutes). */
  async defaultWarehouseId(accessToken) {
    this._warehouseCache = this._warehouseCache || new Map()
    const hit = this._warehouseCache.get(accessToken)
    if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.id
    let id = null
    try {
      const res = await this.call('bg.logistics.warehouse.list.get', { access_token: accessToken })
      const list = res.warehouseList || Object.values(res || {}).find(Array.isArray) || []
      const pick = list.find((row) => row.defaultWarehouse || row.isDefault) || (list.length === 1 ? list[0] : null)
      id = pick ? String(pick.warehouseId || pick.id || '') || null : null
    } catch {
      id = null
    }
    this._warehouseCache.set(accessToken, { at: Date.now(), id })
    return id
  }

  /**
   * Self-fulfilled shipment: confirms the seller's own carrier + tracking number on Temu with
   * bg.logistics.shipment.v2.confirm (Order Fulfillment Guide). Packages bought with Temu
   * buy-shipping are not handled here.
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [] } = {}) {
    const cleanTracking = String(trackingNumber || '').trim().replace(/[\s-]+/g, '')
    if (!cleanTracking) throw new Error('Tracking number is required to fulfill a Temu order')
    const carrierId = carrier ? await this.resolveCarrierId(accessToken, carrier) : null
    if (!carrierId) {
      throw new Error(`Temu needs a carrier from its list (for example USPS, UPS or FedEx)${carrier ? `; "${carrier}" was not found` : ''}.`)
    }
    const orderSendInfoList = (lineItems || []).map((line) => {
      const [goodsId, skuId] = String(line.externalListingId || '').split(':')
      return {
        parentOrderSn: String(orderId),
        orderSn: String(line.lineItemId || ''),
        quantity: Number(line.quantity || 1),
        ...(goodsId ? { goodsId: Number(goodsId) } : {}),
        ...(skuId ? { skuId: Number(skuId) } : {}),
      }
    })
    if (!orderSendInfoList.length || orderSendInfoList.some((line) => !line.orderSn || !line.goodsId || !line.skuId)) {
      throw new Error('This Temu order is missing item details. Sync the shop, then try again.')
    }
    const warehouseId = await this.defaultWarehouseId(accessToken)
    const result = await this.call('bg.logistics.shipment.v2.confirm', {
      access_token: accessToken,
      sendType: 0,
      sendRequestList: [
        {
          orderSendInfoList,
          carrierId: Number(carrierId) || carrierId,
          trackingNumber: cleanTracking,
          ...(warehouseId ? { selfShippingWarehouseId: warehouseId } : {}),
        },
      ],
    })
    return result || { success: true }
  }

  /**
   * Temu lets sellers cancel only for out of stock (temu.order.cancel.outofstock.apply).
   */
  async cancelOrder(accessToken, orderId) {
    const result = await this.call('temu.order.cancel.outofstock.apply', {
      access_token: accessToken,
      parentOrderSn: String(orderId),
    })
    if (result?.applyResult === false) {
      const reasons = (result.failReasonList || []).flatMap((row) => row.reasonList || [])
      throw new Error(`Temu did not cancel the order${reasons.length ? `: ${reasons.join('; ')}` : '.'}`)
    }
    return result || { success: true }
  }

  /** Open after-sales requests for an order (bg.aftersales.parentaftersales.list.get). */
  async afterSalesForOrder(accessToken, orderId) {
    const res = await this.call('bg.aftersales.parentaftersales.list.get', {
      access_token: accessToken,
      pageNo: 1,
      pageSize: 20,
      parentOrderSnList: [String(orderId)],
    })
    return res?.data || []
  }

  /**
   * Temu refunds only an existing after-sales request, and only in full (Return and Refund Guide:
   * partial refunds are not supported through the API).
   */
  async issueRefund(accessToken, orderId, { amount, orderTotal } = {}) {
    if (amount && orderTotal && Number(amount) < Number(orderTotal)) {
      throw new Error('Temu only allows full refunds through the API. Issue a partial refund in Temu Seller Center.')
    }
    const requests = await this.afterSalesForOrder(accessToken, orderId)
    // 1 refund requested, 3 return received, 8 waiting for return label (all "Pending").
    const open = requests.find((row) => [1, 3, 8].includes(Number(row.parentAfterSalesStatus)))
    if (!open) {
      throw new Error('Temu refunds need a buyer refund or return request on this order. None is waiting for you.')
    }
    return this.call('temu.aftersales.refund.issue', {
      access_token: accessToken,
      parentAfterSalesSn: String(open.parentAfterSalesSn),
      parentOrderSn: String(orderId),
    })
  }

  /** Approve = full refund. Temu's API cannot decline a return; that is done in Seller Center. */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE', orderId } = {}) {
    if (!/approve/i.test(decision)) {
      throw new Error('Temu does not allow declining returns through the API. Decline it in Temu Seller Center.')
    }
    return this.call('temu.aftersales.refund.issue', {
      access_token: accessToken,
      parentAfterSalesSn: String(returnId),
      ...(orderId ? { parentOrderSn: String(orderId) } : {}),
    })
  }

  /** Approve a buyer's cancellation (bg.aftersales.cancel.agree). Temu has no API to reject one. */
  async decideCancellation(accessToken, cancelId, { action = 'approve', orderId } = {}) {
    if (String(action).toLowerCase() !== 'approve') {
      throw new Error('Temu does not allow rejecting cancellations through the API. Handle it in Temu Seller Center.')
    }
    return this.call('bg.aftersales.cancel.agree', {
      access_token: accessToken,
      parentAfterSalesSn: String(cancelId),
      ...(orderId ? { parentOrderSn: String(orderId) } : {}),
    })
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
