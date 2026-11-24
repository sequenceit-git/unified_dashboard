/**
 * One-click actions of the eBay Returns & cases section (row `actions` → POST
 * /api/ebay/sections/returns-cases/<id>). Each `run(client, token, id, value)` calls eBay and
 * returns `{ message }`. `client`: `{ postOrder, ebaySend, apiz }`. Paths are written out in full so
 * the API coverage report sees them.
 */
const { HttpError } = require('../../../utils/httpError')

const enc = encodeURIComponent
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other']
const MAX_FILE = 5 * 1024 * 1024
// eBay's EvidenceTypeEnum values a seller can send with photos.
const EVIDENCE_TYPES = {
  PROOF_OF_DELIVERY: 'Proof of delivery',
  PROOF_OF_AUTHENTICITY: 'Proof of authenticity',
  PROOF_OF_ITEM_AS_DESCRIBED: 'Proof the item is as described',
  PROOF_OF_PICKUP: 'Proof of pickup',
  TRACKING_INFORMATION: 'Tracking information',
}
// Carriers eBay's return label call takes (carrierEnum), by the names the dashboard shows.
const LABEL_CARRIERS = { USPS: 'USPS', UPS: 'UPS', FedEx: 'FEDEX', DHL: 'DHL' }
// Why a seller asks eBay to step into a return.
const RETURN_ESCALATIONS = {
  BUYER_RETURNED_WRONG_ITEM: 'The buyer sent back a different item',
  BUYER_DAMAGED_ITEM: 'The item came back damaged',
  BUYER_STILL_UNHAPPY_AFTER_REFUND: 'The buyer is still unhappy after the refund',
  OTHERS: 'Something else',
}
const MAX_MESSAGE = 1000

/** A message typed for the buyer: 1–1000 characters. */
function messageText(value) {
  const content = String(value ?? '').trim()
  if (!content || content.length > MAX_MESSAGE) throw new HttpError(400, { error: `A message is 1 to ${MAX_MESSAGE} characters.` })
  return content
}

const ADDRESS_FIELDS = [
  { name: 'fullName', label: 'Return to (full name)' },
  { name: 'addressLine1', label: 'Address' },
  { name: 'city', label: 'City' },
  { name: 'stateOrProvince', label: 'State' },
  { name: 'postalCode', label: 'ZIP code' },
  { name: 'country', label: 'Country code (e.g. US)', maxLength: 2 },
  { name: 'primaryPhone', label: 'Phone' },
]

/**
 * A photo sent from the dashboard (`{ name, dataUrl }`) as bytes. Only JPEG or PNG (checked by
 * the file's own bytes, not its name) up to 5 MB; never written anywhere.
 */
function imageFile(file) {
  const match = /^data:[^;,]*;base64,(.*)$/s.exec(String(file?.dataUrl || ''))
  if (!match) throw new HttpError(400, { error: 'Choose a photo (JPEG or PNG).' })
  const buffer = Buffer.from(match[1], 'base64')
  const type = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? 'image/jpeg'
    : buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png' : null
  if (!type) throw new HttpError(400, { error: 'eBay accepts JPEG or PNG photos only.' })
  if (buffer.length > MAX_FILE) throw new HttpError(400, { error: 'The photo is larger than 5 MB.' })
  const name = String(file.name || '').replace(/[^\w.\- ]/g, '').slice(0, 100) || (type === 'image/png' ? 'photo.png' : 'photo.jpg')
  return { name, type, buffer }
}

/** The dispute, when the seller may still add evidence or contest it (else 400). */
async function contestable(client, token, id) {
  const dispute = await client.ebaySend(token, 'GET', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}`)
  if (dispute.sellerResponse || !(dispute.availableChoices || []).includes('CONTEST')) {
    throw new HttpError(400, { error: `eBay no longer lets you contest payment dispute ${id}.` })
  }
  return dispute
}

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
  'return-message': {
    label: 'Message buyer',
    run: async (client, token, id, value = {}) => {
      const content = messageText(value.message)
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/send_message`, { method: 'POST', body: { message: { content } } })
      return { message: `Message sent on return ${id}.` }
    },
  },
  'return-photo': {
    label: 'Add photo',
    // Post-Order takes the photo as base64 JSON, then a submit makes it visible on the return.
    run: async (client, token, id, value = {}) => {
      const file = imageFile(value.file)
      const up = await client.postOrder(token, `/post-order/v2/return/${enc(id)}/file/upload`, { method: 'POST', body: { fileName: file.name, data: file.buffer.toString('base64'), filePurpose: 'ITEM_RELATED' } })
      if (!up?.fileId) throw new HttpError(502, { error: 'eBay did not accept the photo.' })
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/file/submit`, { method: 'POST', body: { filePurpose: 'ITEM_RELATED' } })
      return { message: `${file.name} added to return ${id}.` }
    },
  },
  'return-label': {
    label: 'Send return label',
    run: async (client, token, id, value = {}) => {
      const carrierEnum = LABEL_CARRIERS[String(value.carrier || '')]
      const trackingNumber = String(value.trackingNumber || '').trim()
      if (!carrierEnum || !trackingNumber) throw new HttpError(400, { error: 'Choose the carrier and enter the label tracking number.' })
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/add_shipping_label`, { method: 'POST', body: { carrierEnum, trackingNumber } })
      return { message: `Return label ${trackingNumber} sent to the buyer for return ${id}.` }
    },
  },
  'return-escalate': {
    label: 'Ask eBay to step in',
    run: async (client, token, id, value = {}) => {
      const reason = String(value.reason || '')
      if (!Object.hasOwn(RETURN_ESCALATIONS, reason)) throw new HttpError(400, { error: 'Choose why eBay should step in.' })
      const comments = String(value.comments || '').trim().slice(0, MAX_MESSAGE)
      await client.postOrder(token, `/post-order/v2/return/${enc(id)}/escalate`, { method: 'POST', body: { reason, ...(comments ? { comments: { content: comments } } : {}) } })
      return { message: `eBay was asked to step into return ${id}.` }
    },
  },
  'dispute-evidence': {
    label: 'Add evidence',
    // Upload (multipart) → add the file to a new evidence set, or to the set of that type eBay already has.
    run: async (client, token, id, value = {}) => {
      const evidenceType = String(value.evidenceType || '')
      if (!Object.hasOwn(EVIDENCE_TYPES, evidenceType)) throw new HttpError(400, { error: 'Choose what the photo proves.' })
      const file = imageFile(value.file)
      const dispute = await contestable(client, token, id)
      const { fileId } = await client.upload(token, `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}/upload_evidence_file`, file)
      if (!fileId) throw new HttpError(502, { error: 'eBay did not accept the photo.' })
      const lineItems = (dispute.lineItems || []).map((l) => ({ itemId: l.itemId, lineItemId: l.lineItemId }))
      const existing = (dispute.evidence || []).find((e) => e.evidenceType === evidenceType)
      if (existing) {
        await client.ebaySend(token, 'POST', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}/update_evidence`, { evidenceId: existing.evidenceId, evidenceType, files: [{ fileId }], lineItems })
      } else {
        await client.ebaySend(token, 'POST', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}/add_evidence`, { evidenceType, files: [{ fileId }], lineItems })
      }
      return { message: `${file.name} added to payment dispute ${id} as ${EVIDENCE_TYPES[evidenceType].toLowerCase()}. Contest the dispute when all your evidence is in.` }
    },
  },
  'dispute-contest': {
    label: 'Contest',
    // eBay needs the current revision; an item-not-as-described dispute also needs the return address.
    run: async (client, token, id, value = {}) => {
      const dispute = await contestable(client, token, id)
      const note = String(value.note || '').trim().slice(0, 1000)
      let returnAddress
      if (dispute.reason === 'SIGNIFICANTLY_NOT_AS_DESCRIBED') {
        const a = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f.name, String(value[f.name] || '').trim()]))
        if (ADDRESS_FIELDS.some((f) => !a[f.name])) throw new HttpError(400, { error: 'eBay needs the full return address and a phone number to contest this dispute.' })
        returnAddress = { ...a, country: a.country.toUpperCase(), primaryPhone: { countryCode: a.country.toUpperCase(), number: a.primaryPhone } }
      }
      await client.ebaySend(token, 'POST', `${client.apiz}/sell/fulfillment/v1/payment_dispute/${enc(id)}/contest`, {
        revision: dispute.revision,
        ...(note ? { note } : {}),
        ...(returnAddress ? { returnAddress } : {}),
      })
      return { message: `Payment dispute ${id} contested. eBay reviews your evidence and decides.` }
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

module.exports = { ACTIONS, CARRIERS, EVIDENCE_TYPES, ADDRESS_FIELDS, LABEL_CARRIERS, RETURN_ESCALATIONS, MAX_MESSAGE, imageFile, messageText }
