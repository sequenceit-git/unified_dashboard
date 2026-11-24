/**
 * One-click actions of the eBay Returns & cases section (row `actions` → POST
 * /api/ebay/sections/returns-cases/<id>). Each `run(client, token, id, value)` calls eBay and
 * returns `{ message }`. `client`: `{ postOrder, ebaySend, apiz }`. Paths are written out in full so
 * the API coverage report sees them.
 */
const { HttpError } = require('../../../utils/httpError')

const enc = encodeURIComponent
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other']

const ACTIONS = {
  'mark-received': {
    label: 'Mark received',
    run: async (client, token, id) => {
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/mark_as_received`, { method: 'POST', body: {} })
      return { message: `Return ${id} marked as received.` }
    },
  },
  refund: {
    label: 'Refund',
    // Refunds eBay's own estimate for the return, never an amount typed in the dashboard.
    run: async (client, token, id) => {
      const ret = await client.postOrder(token, `/post-order/v2/return/${enc(id)}`, { method: 'GET' })
      const amount = ret.summary?.sellerTotalRefund?.estimatedRefundAmount || ret.sellerTotalRefund?.estimatedRefundAmount
      if (!amount?.value) throw new HttpError(400, { error: `eBay has no refund amount for return ${id} yet.` })
      const total = { value: Number(amount.value), currency: amount.currency || 'USD' }
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/issue_refund`, {
        method: 'POST',
        body: { refundDetail: { itemizedRefundDetail: [{ refundAmount: total, refundFeeType: 'PURCHASE_PRICE' }], totalAmount: total } },
      })
      return { message: `Refund of ${total.currency} ${total.value.toFixed(2)} sent for return ${id}.` }
    },
  },
  'inquiry-refund': {
    label: 'Refund',
    run: async (client, token, id) => {
      await client.postOrder(token, `/post-order/v2/inquiry/${enc(id)}/issue_refund`, { method: 'POST', body: {} })
      return { message: `Inquiry ${id} refunded.` }
    },
  },
  'inquiry-tracking': {
    label: 'Add tracking',
    run: async (client, token, id, value = {}) => {
      const trackingNumber = String(value.trackingNumber || '').trim()
      const carrier = String(value.carrier || '').trim()
      if (!trackingNumber || !carrier) throw new HttpError(400, { error: 'A tracking number and a carrier are required.' })
      await client.postOrder(token, `/post-order/v2/inquiry/${enc(id)}/provide_shipment_info`, {
        method: 'POST',
        body: { trackingNumber, shippingCarrierName: carrier },
      })
      return { message: `Tracking ${trackingNumber} sent for inquiry ${id}.` }
    },
  },
  'dispute-accept': {
    label: 'Accept',
    // eBay asks for the dispute's current revision with the accept.
    run: async (client, token, id) => {
      const dispute = await client.ebaySend(token, 'GET', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}`)
      await client.ebaySend(token, 'POST', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}/accept`, { revision: dispute.revision })
      return { message: `Payment dispute ${id} accepted.` }
    },
  },
}

module.exports = { ACTIONS, CARRIERS }
