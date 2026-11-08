/**
 * eBay Marketplace Account Deletion notifications (required for production keys).
 * Verifies eBay's signature, then anonymises the deleted eBay user's personal data.
 */
const crypto = require('crypto')
const config = require('../config/marketplaces').ebay
const ebay = require('./marketplace/ebay')
const Customer = require('../models/Customer')
const Order = require('../models/Order')
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')

const keyCache = new Map()

/** Public key eBay signs notifications with (Commerce Notification API, app token). */
async function publicKey(kid) {
  if (keyCache.has(kid)) return keyCache.get(kid)
  const token = await ebay.getApplicationToken()
  if (!token) throw new Error('eBay application token unavailable')
  const res = await fetch(`${config.apiBaseUrl}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`public key lookup failed (${res.status})`)
  const { key } = await res.json()
  const pem = String(key).includes('BEGIN') ? key : `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`
  keyCache.set(kid, pem)
  return pem
}

/** True when the X-EBAY-SIGNATURE header matches the raw request body. */
async function verifySignature(header, rawBody) {
  if (!header || !rawBody) return false
  try {
    const { kid, signature, digest } = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    if (!kid || !signature) return false
    const verifier = crypto.createVerify(digest || 'SHA1')
    verifier.update(rawBody)
    return verifier.verify(await publicKey(kid), signature, 'base64')
  } catch (err) {
    console.warn('[ebay-deletion] signature check failed:', err.message)
    return false
  }
}

/** Removes the buyer's personal data; order totals and items stay for accounting. */
async function purgeUser({ username, userId }) {
  const names = [username, userId].filter(Boolean)
  if (!names.length) return { customers: 0, orders: 0, conversations: 0 }

  const customers = await Customer.find({
    $or: [{ 'identities.username': { $in: names } }, { 'identities.externalBuyerId': { $in: names } }],
  }).select('_id')
  const customerIds = customers.map((row) => row._id)

  await Customer.updateMany(
    { _id: { $in: customerIds } },
    { $set: { name: 'Deleted eBay user', identities: [], addresses: [] }, $unset: { email: '', phone: '', address: '' } },
  )
  const orders = await Order.updateMany(
    { $or: [{ 'buyer.username': { $in: names } }, ...(customerIds.length ? [{ customerId: { $in: customerIds } }] : [])] },
    { $set: { buyer: { name: 'Deleted eBay user' } }, $unset: { shippingAddress: '' } },
  )
  const convos = await Conversation.find({
    $or: [{ customerName: { $in: names } }, ...(customerIds.length ? [{ customerId: { $in: customerIds } }] : [])],
  }).select('_id')
  const convoIds = convos.map((row) => row._id)
  if (convoIds.length) {
    await Message.deleteMany({ conversationId: { $in: convoIds } })
    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      { $set: { customerName: 'Deleted eBay user', lastMessagePreview: '' } },
    )
  }
  return { customers: customerIds.length, orders: orders.modifiedCount, conversations: convoIds.length }
}

module.exports = { verifySignature, purgeUser }
