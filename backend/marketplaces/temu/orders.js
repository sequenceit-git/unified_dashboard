/**
 * Temu orders: fetch + enrich, ship (self-fulfilled), cancel, refunds, return and cancellation
 * decisions. Methods use `this.call` from the client (see service.js).
 */
const { ORDER_STATUS, temuDate, temuAddress, temuMoney } = require('./format')

module.exports = {
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
  },

  /**
   * The order list can leave out the buyer address and amounts. Orders still to ship get their
   * address from bg.order.shippinginfo.v2.get, and orders without a total get it from
   * bg.order.amount.query. Each order is asked at most once per few hours, and a sync makes at
   * most `maxCalls` of these calls.
   */
  async fillOrderDetails(accessToken, orders, { maxCalls = 20 } = {}) {
    const cache = require('../../services/core/cache')
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
  },

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
  },

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
  },

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
  },

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
  },

  /** Open after-sales requests for an order (bg.aftersales.parentaftersales.list.get). */
  async afterSalesForOrder(accessToken, orderId) {
    const res = await this.call('bg.aftersales.parentaftersales.list.get', {
      access_token: accessToken,
      pageNo: 1,
      pageSize: 20,
      parentOrderSnList: [String(orderId)],
    })
    return res?.data || []
  },

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
  },

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
  },

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
  },
}
