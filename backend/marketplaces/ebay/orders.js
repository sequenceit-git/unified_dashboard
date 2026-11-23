/** orders: methods mixed into the service (they use `this.call` and other service methods). */
const config = require('./config')

module.exports = {
  /** One order from the Sell Fulfillment API (line items carry the `lineItemId` eBay needs). */
  async getOrder(accessToken, orderId) {
    const response = await fetch(`${config.apiBaseUrl}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const error = new Error(`eBay Order API Error: ${err.errors?.[0]?.message || err.message || response.statusText}`)
      error.status = response.status
      throw error
    }
    return response.json()
  },

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
      throw new Error(`eBay Order API Error: ${err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || response.statusText}`)
    }

    return response.json()
  },

  /**
   * Retrieves post-order cancellation requests from eBay Post-Order API
   */
  async getCancellations(accessToken) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/post-order/v2/cancellation/search?limit=50`, {
        headers: {
          Authorization: `IAF ${accessToken}`,
          Accept: 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      })
      if (!response.ok) {
        const fallback = await fetch(`${config.apiBaseUrl}/post-order/v2/cancellation/search?limit=50`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          },
        })
        if (!fallback.ok) return []
        const data = await fallback.json().catch(() => ({}))
        return data.cancellations || []
      }
      const data = await response.json().catch(() => ({}))
      return data.cancellations || []
    } catch {
      return []
    }
  },

  /**
   * Retrieves post-order return requests and cases from eBay Post-Order API
   */
  async getReturns(accessToken) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/post-order/v2/return/search?limit=50`, {
        headers: {
          Authorization: `IAF ${accessToken}`,
          Accept: 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      })
      if (!response.ok) {
        const fallback = await fetch(`${config.apiBaseUrl}/post-order/v2/return/search?limit=50`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          },
        })
        if (!fallback.ok) return []
        const data = await fallback.json().catch(() => ({}))
        return data.members || []
      }
      const data = await response.json().catch(() => ({}))
      return data.members || []
    } catch {
      return []
    }
  },

  /**
   * Retrieves shipping fulfillment records (tracking number, carrier, shipped date) for an eBay order
   */
  async getShippingFulfillments(accessToken, orderId) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })
      if (!response.ok) return []
      const data = await response.json().catch(() => ({}))
      return data.fulfillments || []
    } catch {
      return []
    }
  },

  /**
   * Updates shipping tracking information for an eBay order
   */
  async createShippingFulfillment(accessToken, orderId, { carrier, trackingNumber, lineItems = [] }) {
    if (!carrier || /^other$/i.test(String(carrier).trim())) {
      throw new Error('eBay needs the shipping carrier (for example USPS, UPS, FedEx or DHL) together with the tracking number.')
    }
    const cleanTracking = String(trackingNumber || '').trim().replace(/[\s-]+/g, '')
    if (!cleanTracking) throw new Error('eBay needs a tracking number.')
    const payload = {
      shippingCarrierCode: carrier || 'USPS',
      trackingNumber: cleanTracking,
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
      throw new Error(`eBay Shipping Error: ${err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || response.statusText}`)
    }

    return response.status === 201 ? { success: true } : response.json()
  },

  /**
   * Issues refund or processes return for an order via Sell Fulfillment API
   */
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = 'Order refunded', amount = null } = {}) {
    // eBay's ReasonForRefundEnum; the dashboard's own reason names are mapped onto it.
    const REFUND_REASONS = {
      BUYER_CANCEL: 'BUYER_CANCEL',
      OUT_OF_STOCK: 'SELLER_CANCEL',
      SELLER_CANCEL: 'SELLER_CANCEL',
      BUYER_RETURN: 'BUYER_RETURN',
      ITEM_NOT_RECEIVED: 'ITEM_NOT_RECEIVED',
      ITEM_NOT_AS_DESCRIBED: 'ITEM_NOT_AS_DESCRIBED',
      CUSTOMER_SERVICE: 'OTHER_ADJUSTMENT',
      OTHER: 'OTHER_ADJUSTMENT',
      OTHER_ADJUSTMENT: 'OTHER_ADJUSTMENT',
      SHIPPING_DISCOUNT: 'SHIPPING_DISCOUNT',
    }
    const payload = {
      reasonForRefund: REFUND_REASONS[reason] || 'OTHER_ADJUSTMENT',
      comment: String(comment || '').slice(0, 1000),
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
      throw new Error(`eBay Refund Error: ${err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || response.statusText}`)
    }

    return response.json()
  },

  /**
   * Seller-initiated cancellation. The Sell Fulfillment API has no cancel call, so this uses the
   * Post-Order API (POST /post-order/v2/cancellation), which needs the legacy order ID.
   */
  async cancelOrder(accessToken, orderId, { reason = 'OUT_OF_STOCK' } = {}) {
    // CancelReasonEnum, seller-side values. OUT_OF_STOCK_OR_CANNOT_FULFILL gives the seller a
    // transaction defect on eBay; BUYER_ASKED_CANCEL and ADDRESS_ISSUES do not.
    const CANCEL_REASONS = {
      OUT_OF_STOCK: 'OUT_OF_STOCK_OR_CANNOT_FULFILL',
      BUYER_CANCEL: 'BUYER_ASKED_CANCEL',
      BUYER_ASKED_CANCEL: 'BUYER_ASKED_CANCEL',
      ADDRESS_ISSUES: 'ADDRESS_ISSUES',
      ORDER_UNPAID: 'ORDER_UNPAID',
    }
    const order = await this.getOrder(accessToken, orderId)
    const paid = ['PAID', 'PARTIALLY_REFUNDED'].includes(String(order.orderPaymentStatus || '').toUpperCase())
    const paidAt = order.paymentSummary?.payments?.[0]?.paymentDate || order.creationDate
    // Post-Order wants the Trading-style order id. eBay now returns the same value in both
    // fields for most orders; try the legacy one first, then the REST one.
    const ids = [...new Set([order.legacyOrderId, order.orderId, orderId].filter(Boolean).map(String))]
    let lastError
    for (const legacyOrderId of ids) {
      try {
        const check = await this.postOrder(accessToken, '/post-order/v2/cancellation/check_eligibility', {
          method: 'POST',
          label: 'eBay Cancellation Eligibility Error',
          body: { legacyOrderId },
        })
        if (check.eligible === false) {
          const why = (check.failureReason || []).map((row) => String(row).replace(/_/g, ' ').toLowerCase()).join(', ')
          throw Object.assign(new Error(`eBay will not let this order be cancelled${why ? `: ${why}` : ''}.`), { final: true })
        }
        const payload = await this.postOrder(accessToken, '/post-order/v2/cancellation', {
          method: 'POST',
          label: 'eBay Order Cancellation Error',
          body: {
            legacyOrderId,
            cancelReason: CANCEL_REASONS[reason] || 'BUYER_ASKED_CANCEL',
            buyerPaid: paid,
            ...(paid && paidAt ? { buyerPaidDate: { value: new Date(paidAt).toISOString() } } : {}),
          },
        })
        return { success: true, cancelId: payload.cancelId || null }
      } catch (err) {
        if (err.final) throw err
        lastError = err
      }
    }
    throw lastError
  },

  /**
   * Approves or rejects a buyer cancellation request via Post-Order API
   */
  async decideCancellation(accessToken, cancelId, { action = 'approve', trackingNumber, shipmentDate } = {}) {
    const isApprove = String(action).toLowerCase() === 'approve'
    const endpoint = isApprove
      ? `/post-order/v2/cancellation/${encodeURIComponent(cancelId)}/approve`
      : `/post-order/v2/cancellation/${encodeURIComponent(cancelId)}/reject`
    const body = !isApprove && trackingNumber
      ? { trackingNumber, ...(shipmentDate ? { shipmentDate: { value: shipmentDate } } : {}) }
      : {}
    const result = await this.postOrder(accessToken, endpoint, {
      method: 'POST',
      body,
      label: 'eBay Cancellation Decision Error',
    })
    return Object.keys(result).length ? result : { success: true }
  },

  /**
   * Decides on a buyer return request via Post-Order API (e.g. APPROVE or DECLINE)
   */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE', comments = '' } = {}) {
    const payload = {
      decision: decision || 'APPROVE',
      ...(comments ? { comments: { content: String(comments) } } : {}),
    }
    const result = await this.postOrder(accessToken, `/post-order/v2/return/${encodeURIComponent(returnId)}/decide`, {
      method: 'POST',
      body: payload,
      label: 'eBay Return Decision Error',
    })
    return Object.keys(result).length ? result : { success: true }
  },
}
