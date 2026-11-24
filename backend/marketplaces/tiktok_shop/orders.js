/** orders: methods mixed into the service (they use `this.call` and other service methods). */
const { normalizeOrder, CARRIER_ALIASES } = require('./format')

async function callLatest(primary, fallback) {
  try {
    return await primary()
  } catch (err) {
    if (!/version|not found|404/i.test(err?.message || '')) throw err
    return fallback()
  }
}

module.exports = {
  async getOrders(accessToken, { shop, limit = 1000, since = null } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const sinceSec = since ? Math.floor(new Date(since).getTime() / 1000) : null
    const filterBody = Number.isFinite(sinceSec) && sinceSec > 0
      ? { update_time_ge: sinceSec, update_time_lt: now }
      : { create_time_ge: now - 365 * 24 * 3600, create_time_lt: now }
    const orders = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/order/202309/orders/search', {
        shop,
        query: {
          page_size: 100,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: filterBody,
      })
      for (const order of data.orders || []) {
        orders.push(normalizeOrder(order))
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && orders.length < limit)
    return { orders, complete: !pageToken }
  },

  async getOrderDetails(accessToken, orderIds = [], { shop } = {}) {
    const ids = (orderIds || []).map((id) => String(id || '').trim()).filter(Boolean)
    if (!ids.length) return []
    const out = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const data = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: chunk.join(',') },
      })
      for (const order of data.orders || []) out.push(normalizeOrder(order))
    }
    return out
  },

  async getReturns(accessToken, { shop, limit = 200 } = {}) {
    const rows = []
    let pageToken = ''
    do {
      const opts = {
        shop,
        query: {
          page_size: 50,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: {},
      }
      const data = await callLatest(
        () => this.call(accessToken, 'POST', '/return_refund/202602/returns/search', opts),
        () => this.call(accessToken, 'POST', '/return_refund/202309/returns/search', opts),
      )
      rows.push(...(data.return_orders || []))
      pageToken = data.next_page_token || ''
    } while (pageToken && rows.length < limit)
    return rows
  },

  async getCancellations(accessToken, { shop, limit = 200 } = {}) {
    const rows = []
    let pageToken = ''
    do {
      const opts = {
        shop,
        query: {
          page_size: 50,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: {},
      }
      const data = await callLatest(
        () => this.call(accessToken, 'POST', '/return_refund/202602/cancellations/search', opts),
        () => this.call(accessToken, 'POST', '/return_refund/202309/cancellations/search', opts),
      )
      rows.push(...(data.cancellations || []))
      pageToken = data.next_page_token || ''
    } while (pageToken && rows.length < limit)
    return rows
  },

  async defaultWarehouseId(accessToken, shop) {
    const key = String(shop?._id || shop?.shopCipher || 'default')
    this._warehouseCache = this._warehouseCache || new Map()
    const cached = this._warehouseCache.get(key)
    if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.id
    const data = await this.call(accessToken, 'GET', '/logistics/202309/warehouses', { shop })
    const warehouses = (data.warehouses || []).filter((row) => row.type !== 'RETURN_WAREHOUSE')
    const chosen = warehouses.find((row) => row.is_default) || warehouses[0]
    if (!chosen) throw new Error('TikTok Shop has no sales warehouse. Add one in Seller Center first.')
    const id = String(chosen.id)
    this._warehouseCache.set(key, { id, at: Date.now() })
    return id
  },

  /**
   * Pushes tracking number and fulfills package/order on TikTok Shop (Seller Shipping).
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [], shop } = {}) {
    const cleanTracking = String(trackingNumber || '').trim().replace(/[\s-]+/g, '')
    if (!cleanTracking) throw new Error('TikTok Shop needs a tracking number.')

    let lineItemIds = (lineItems || []).map((l) => l.lineItemId || l.id).filter(Boolean)
    let providerId = ''
    let order = null

    try {
      const orderData = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: String(orderId) },
      })
      order = orderData.orders?.[0] || null
    } catch {}

    if (String(order?.shipping_type || '').toUpperCase() === 'TIKTOK') {
      throw new Error('This order uses TikTok Shipping (platform label). Ship it and download the label from TikTok Shop > Packages instead of pushing a seller tracking number.')
    }

    if (!lineItemIds.length && order?.line_items?.length) {
      lineItemIds = order.line_items.map((li) => li.id).filter(Boolean)
    }

    const matchCarrier = (name) => {
      const needle = String(carrier || '').trim().toLowerCase()
      if (!needle || needle === 'other') return false
      const lowerName = String(name || '').toLowerCase()
      if (lowerName.includes(needle)) return true
      const aliases = CARRIER_ALIASES[needle] || []
      return aliases.some((alias) => lowerName.includes(alias))
    }

    const hasExplicitCarrier = Boolean(carrier && String(carrier).trim() && String(carrier).trim().toLowerCase() !== 'other')
    let deliveryOptionId = order?.delivery_option_id || ''
    if (!deliveryOptionId) {
      const warehouseId = order?.warehouse_id || await this.defaultWarehouseId(accessToken, shop).catch(() => '')
      if (warehouseId) {
        try {
          const opts = await this.call(accessToken, 'GET', `/logistics/202309/warehouses/${encodeURIComponent(warehouseId)}/delivery_options`, { shop })
          deliveryOptionId = opts.delivery_options?.[0]?.id || ''
        } catch {}
      }
    }

    let providers = []
    if (deliveryOptionId) {
      try {
        const provData = await this.call(accessToken, 'GET', `/logistics/202309/delivery_options/${encodeURIComponent(deliveryOptionId)}/shipping_providers`, { shop })
        providers = provData.shipping_providers || []
        const match = providers.find((p) => matchCarrier(p.name))
        if (match) providerId = match.id
        else if (!hasExplicitCarrier && providers.length && !order?.shipping_provider_id) providerId = providers[0].id
      } catch {}
    }

    let servicesList = []
    if (!providerId || !lineItemIds.length) {
      try {
        const services = await this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/shipping_services/query`, {
          shop,
          body: {},
        })
        servicesList = services.shipping_services || []
        if (!providerId && servicesList.length) {
          const match = servicesList.find((s) => matchCarrier(s.shipping_provider_name) || matchCarrier(s.name))
          if (match) providerId = match.shipping_provider_id
          else if (!hasExplicitCarrier) providerId = servicesList[0].shipping_provider_id
        }
        if (!lineItemIds.length && services.order_line_id?.length) {
          lineItemIds = services.order_line_id
        }
      } catch {}
    }

    if (!providerId && hasExplicitCarrier) {
      const known = [...providers.map((p) => p.name), ...servicesList.map((s) => s.shipping_provider_name || s.name)].filter(Boolean)
      if (known.length) {
        throw new Error(`Carrier "${carrier}" did not match TikTok Shop providers (${[...new Set(known)].join(', ')}).`)
      }
    }

    if (!providerId && !hasExplicitCarrier && order?.shipping_provider_id) {
      providerId = order.shipping_provider_id
    }

    if (!providerId) {
      throw new Error(`Could not resolve a TikTok Shop shipping provider for${carrier ? ` "${carrier}" on` : ''} order ${orderId}.`)
    }

    const existingTracking = order?.tracking_number || (order?.line_items || []).find((li) => li.tracking_number)?.tracking_number
    const alreadyShipped = ['IN_TRANSIT', 'AWAITING_COLLECTION', 'PARTIALLY_SHIPPING'].includes(order?.status) || Boolean(existingTracking)
    if (alreadyShipped) {
      return this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/shipping_info/update`, {
        shop,
        body: {
          tracking_number: cleanTracking,
          shipping_provider_id: String(providerId),
        },
      })
    }

    const body = {
      tracking_number: cleanTracking,
      shipping_provider_id: String(providerId),
      ...(lineItemIds.length ? { order_line_item_ids: lineItemIds } : {}),
    }

    return callLatest(
      () => this.call(accessToken, 'POST', `/fulfillment/202610/orders/${encodeURIComponent(orderId)}/packages`, { shop, body }),
      () => this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/packages`, { shop, body }),
    )
  },

  /**
   * Ships a package via TikTok Shipping handover (PICKUP / DROP_OFF).
   */
  async shipPackage(accessToken, packageId, { handoverMethod = 'DROP_OFF', shop } = {}) {
    return this.call(accessToken, 'POST', `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/ship`, {
      shop,
      body: {
        handover_method: handoverMethod || 'DROP_OFF',
      },
    })
  },

  /**
   * Cancels unfulfilled order on TikTok Shop
   */
  async cancelOrder(accessToken, orderId, { reason = 'OUT_OF_STOCK', shop } = {}) {
    const reasonMap = {
      OUT_OF_STOCK: 'seller_cancel_reason_out_of_stock',
      BUYER_CANCEL: 'seller_cancel_reason_buyer_request',
      BUYER_ASKED_CANCEL: 'seller_cancel_reason_buyer_request',
      ADDRESS_ISSUES: 'seller_cancel_reason_undeliverable_address',
    }
    const cancel_reason = reasonMap[reason] || 'seller_cancel_reason_out_of_stock'
    const opts = {
      shop,
      body: {
        order_id: String(orderId),
        cancel_reason,
      },
    }
    return callLatest(
      () => this.call(accessToken, 'POST', '/return_refund/202602/cancellations', opts),
      () => this.call(accessToken, 'POST', '/return_refund/202309/cancellations', opts),
    )
  },

  /**
   * Issues refund on TikTok Shop
   */
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = '', amount, orderTotal, shop } = {}) {
    const numAmount = amount != null ? Number(amount) : NaN
    const numTotal = orderTotal != null ? Number(orderTotal) : NaN
    const isPartial = Number.isFinite(numAmount) && numAmount > 0 && Number.isFinite(numTotal) && numTotal > 0 && numAmount < numTotal - 0.005

    try {
      const returns = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
        shop,
        body: { order_ids: [String(orderId)] },
      })
      const actionable = new Set([
        'RETURN_OR_REFUND_REQUEST_PENDING',
        'REPLACEMENT_REQUEST_PENDING',
        'BUYER_SHIPPED_ITEM',
      ])
      const active = (returns.return_orders || []).find((r) => actionable.has(String(r.return_status || '').toUpperCase()))
      if (active) {
        if (isPartial && String(active.return_status || '').toUpperCase() === 'RETURN_OR_REFUND_REQUEST_PENDING') {
          return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(active.return_id)}/approve`, {
            shop,
            body: {
              decision: 'OFFER_PARTIAL_REFUND',
              partial_refund: {
                amount: numAmount.toFixed(2),
                currency: active.refund_amount?.currency || 'USD',
              },
            },
          })
        }
        return this.decideReturn(accessToken, active.return_id, {
          decision: 'APPROVE',
          returnType: active.return_type,
          rawStatus: active.return_status,
          buyerKeepItem: true,
          comment,
          shop,
        })
      }
    } catch {}

    let order = null
    try {
      const orderData = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: String(orderId) },
      })
      order = orderData.orders?.[0] || null
    } catch {}

    const rawStatus = String(order?.status || '').toUpperCase()
    if (!order || ['UNPAID', 'ON_HOLD', 'AWAITING_SHIPMENT'].includes(rawStatus)) {
      if (isPartial) {
        throw new Error('TikTok Shop does not support partial refunds on unshipped orders. Cancel the order for a full refund or refund after delivery.')
      }
      return this.cancelOrder(accessToken, orderId, { reason, comment, shop })
    }

    if (rawStatus === 'CANCELLED') {
      throw new Error('This order is already cancelled on TikTok Shop.')
    }

    const refundTotal = Number.isFinite(numAmount) && numAmount > 0
      ? numAmount.toFixed(2)
      : String(order?.payment?.total_amount || '0')
    const lineItemIds = (order.line_items || []).map((li) => li.id).filter(Boolean)
    const skuCounts = new Map()
    for (const li of order.line_items || []) {
      if (!li.sku_id) continue
      skuCounts.set(String(li.sku_id), (skuCounts.get(String(li.sku_id)) || 0) + 1)
    }
    const reasonMap = {
      OUT_OF_STOCK: 'ecom_order_delivered_refund_reason_missing_product_seller',
      BUYER_CANCEL: 'ecom_order_delivered_refund_reason_missing_product_seller',
      CUSTOMER_SERVICE: 'ecom_order_delivered_refund_reason_missing_product_seller',
      OTHER: 'ecom_order_delivered_refund_reason_wrong_product_seller',
    }
    const returnOpts = {
      shop,
      body: {
        order_id: String(orderId),
        return_type: 'REFUND',
        return_reason: reasonMap[reason] || 'ecom_order_delivered_refund_reason_missing_product_seller',
        currency: order.payment?.currency || 'USD',
        refund_total: String(refundTotal),
        ...(lineItemIds.length ? { order_line_item_ids: lineItemIds } : {}),
        ...(skuCounts.size ? { skus: [...skuCounts.entries()].map(([sku_id, qty]) => ({ sku_id, quantity: qty })) } : {}),
      },
    }
    return callLatest(
      () => this.call(accessToken, 'POST', '/return_refund/202602/returns', returnOpts),
      () => this.call(accessToken, 'POST', '/return_refund/202309/returns', returnOpts),
    )
  },

  /**
   * Approves or rejects a cancellation request on TikTok Shop
   */
  async decideCancellation(accessToken, cancelId, { action = 'approve', comment = '', comments = '', rejectReason = 'seller_reject_apply_product_has_been_packed', shop } = {}) {
    const isApprove = String(action).toLowerCase() === 'approve'
    if (isApprove) {
      return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/approve`, {
        shop,
        body: {},
      })
    }
    const note = comment || comments || 'Order has already been packed and dispatched'
    return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/reject`, {
      shop,
      body: {
        reject_reason: rejectReason || 'seller_reject_apply_product_has_been_packed',
        comment: note,
      },
    })
  },

  /**
   * Approves or rejects a return request on TikTok Shop
   */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE', comment = '', comments = '', rejectReason = 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time', buyerKeepItem = false, returnType = '', rawStatus = '', shop } = {}) {
    const note = comment || comments || ''
    const isApprove = /approve/i.test(decision)
    let resolvedType = returnType
    let resolvedStatus = rawStatus
    if (!resolvedType && !resolvedStatus) {
      try {
        const found = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
          shop,
          body: { return_ids: [String(returnId)] },
        })
        const row = found.return_orders?.[0]
        if (row) {
          resolvedType = row.return_type || ''
          resolvedStatus = row.return_status || ''
        }
      } catch {}
    }

    const upperStatus = String(resolvedStatus || '').toUpperCase()
    const upperType = String(resolvedType || '').toUpperCase()

    if (isApprove) {
      let apiDecision = 'APPROVE_REFUND'
      if (upperStatus === 'BUYER_SHIPPED_ITEM') apiDecision = 'APPROVE_RECEIVED_PACKAGE'
      else if (upperType === 'REPLACEMENT') apiDecision = 'APPROVE_REPLACEMENT'
      else if (upperType === 'RETURN_AND_REFUND') apiDecision = 'APPROVE_RETURN'

      return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/approve`, {
        shop,
        body: {
          decision: apiDecision,
          ...(apiDecision === 'APPROVE_RETURN' && buyerKeepItem === true ? { buyer_keep_item: true } : {}),
        },
      })
    }

    let apiDecision = 'REJECT_REFUND'
    if (upperStatus === 'BUYER_SHIPPED_ITEM') apiDecision = 'REJECT_RECEIVED_PACKAGE'
    else if (upperType === 'REPLACEMENT') apiDecision = 'REJECT_REPLACEMENT'
    else if (upperType === 'RETURN_AND_REFUND') apiDecision = 'REJECT_RETURN'

    const rejectOpts = {
      shop,
      body: {
        decision: apiDecision,
        reject_reason: rejectReason || 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time',
        comment: note || 'Return request declined according to shop policy',
      },
    }
    return callLatest(
      () => this.call(accessToken, 'POST', `/return_refund/202606/returns/${encodeURIComponent(returnId)}/reject`, rejectOpts),
      () => this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/reject`, rejectOpts),
    )
  },

  /**
   * Retrieves shipping documents / label URL for a package on TikTok Shop
   */
  async getShippingDocument(accessToken, packageId, { documentType = 'SHIPPING_LABEL', shop } = {}) {
    return this.call(accessToken, 'GET', `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/shipping_documents`, {
      shop,
      query: { document_type: documentType },
    })
  },
}
