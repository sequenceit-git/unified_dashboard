/**
 * eBay Platform Notifications ("live updates").
 *
 * eBay POSTs a signed SOAP message to our public URL the moment a seller makes a sale or gets a
 * buyer message. The webhook only checks the signature and queues a sync for that shop; the
 * worker does the slow part (importing the order, updating stock on the other shops). The
 * scheduled syncs keep running less often as a backup, because eBay doesn't promise delivery.
 */

const crypto = require('crypto')
const { XMLParser } = require('fast-xml-parser')
const config = require('../config/marketplaces').ebay
const Shop = require('../models/Shop')

/** Which sync each eBay event starts. */
const JOB_FOR_EVENT = {
  FixedPriceTransaction: 'orders',
  AuctionCheckoutComplete: 'orders',
  ItemSold: 'orders',
  AskSellerQuestion: 'inbox',
  MyMessagesM2MMessage: 'inbox',
}

// eBay sends the notification's Timestamp; one older than this is treated as a replay.
const MAX_AGE_MS = 10 * 60 * 1000

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false })

/** Events to subscribe to: EBAY_NOTIFY_EVENTS=Name,Name overrides the default list. */
function eventNames() {
  const custom = String(process.env.EBAY_NOTIFY_EVENTS || '').split(',').map((name) => name.trim()).filter(Boolean)
  return custom.length ? custom : Object.keys(JOB_FOR_EVENT)
}

/** Public https URL eBay posts to: EBAY_NOTIFY_URL, else PUBLIC_URL/CLIENT_URL + the webhook path. */
function notifyUrl() {
  const explicit = String(process.env.EBAY_NOTIFY_URL || '').trim()
  if (explicit) return explicit
  const base = String(process.env.PUBLIC_URL || String(process.env.CLIENT_URL || '').split(',')[0] || '').trim().replace(/\/+$/, '')
  if (!/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/i.test(base)) return ''
  return `${base}/api/ebay/notifications`
}

/** Why live updates can't be turned on, or '' when they can. */
function setupProblem() {
  if (!config.devId) return 'Set EBAY_DEV_ID on the server; eBay signs notifications with it.'
  if (!notifyUrl()) return 'Set EBAY_NOTIFY_URL (or PUBLIC_URL) to the public https address of the API.'
  return ''
}

/** eBay's signature: Base64(MD5(Timestamp + DevID + AppID + CertID)). */
function expectedSignature(timestamp) {
  return crypto.createHash('md5').update(`${timestamp}${config.devId}${config.clientId}${config.clientSecret}`).digest('base64')
}

const textOf = (value) => (value && typeof value === 'object' ? value['#text'] : value) ?? ''

/** Pulls the parts we need out of eBay's SOAP envelope. */
function parse(xml, soapAction = '') {
  let envelope
  try {
    envelope = parser.parse(String(xml || ''))?.Envelope
  } catch {
    return null
  }
  if (!envelope) return null
  const body = envelope.Body || {}
  const response = Object.values(body).find((value) => value && typeof value === 'object') || {}
  const fromHeader = String(soapAction || '').replace(/"/g, '').split('/').pop()
  return {
    event: String(textOf(response.NotificationEventName) || fromHeader || '').trim(),
    recipient: String(textOf(response.RecipientUserID) || '').trim(),
    timestamp: String(textOf(response.Timestamp) || '').trim(),
    signature: String(textOf(envelope.Header?.RequesterCredentials?.NotificationSignature) || '').trim(),
  }
}

function verify({ timestamp, signature } = {}) {
  if (!timestamp || !signature || !config.devId) return false
  const sentAt = Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_AGE_MS) return false
  const expected = Buffer.from(expectedSignature(timestamp))
  const given = Buffer.from(signature)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The connected eBay shop whose seller account received the notification. */
async function findShop(username) {
  if (!username) return null
  const name = new RegExp(`^${escapeRegex(username)}$`, 'i')
  return Shop.findOne({ marketplace: 'ebay', status: 'connected', $or: [{ accountId: name }, { accountUsername: name }] })
    .select('name marketplace')
}

/**
 * Handles one webhook POST. Returns { status, message, job? }; the route replies with `status`.
 * eBay only needs a 200 — the sync itself runs on the worker.
 */
async function handle(xml, soapAction) {
  const note = parse(xml, soapAction)
  if (!note) return { status: 400, message: 'Not an eBay notification' }
  if (!verify(note)) return { status: 401, message: 'Invalid signature' }

  const kind = JOB_FOR_EVENT[note.event]
  if (!kind) return { status: 200, message: `Ignored ${note.event || 'unknown'} event` }

  const shop = await findShop(note.recipient)
  if (!shop) return { status: 200, message: `No connected eBay shop for ${note.recipient || 'unknown seller'}` }

  await require('./syncQueue').enqueue(kind, shop._id, { push: true })
  return { status: 200, message: `${note.event}: queued ${kind} sync for ${shop.name}`, job: kind }
}

/**
 * Subscribes a shop's seller account to the events above and saves the outcome on the shop, so
 * Settings can show whether live updates are on. Also records which eBay account the login
 * belongs to (notifications name the seller, not the shop).
 */
async function enable(shop) {
  const manager = require('./marketplace')
  const trading = require('./marketplace/ebayTrading')
  const problem = setupProblem()
  const events = eventNames()
  let liveUpdates
  if (problem) {
    liveUpdates = { enabled: false, error: problem, checkedAt: new Date() }
  } else {
    try {
      const url = notifyUrl()
      const account = await manager.withShopToken(shop, async (token) => {
        await trading.setNotificationPreferences(token, { url, events })
        return trading.getUser(token).catch(() => ({ userId: '' }))
      })
      liveUpdates = { enabled: true, url, events, enabledAt: new Date(), checkedAt: new Date() }
      if (account.userId && !shop.accountId) {
        await Shop.updateOne({ _id: shop._id }, { accountId: account.userId, accountUsername: account.userId })
      }
    } catch (err) {
      liveUpdates = { enabled: false, error: err.message, checkedAt: new Date() }
    }
  }
  await Shop.updateOne({ _id: shop._id }, { liveUpdates })
  return { liveUpdates: liveUpdates.enabled ? 'on' : 'off', reason: liveUpdates.error || undefined, events: liveUpdates.events }
}

module.exports = { JOB_FOR_EVENT, eventNames, notifyUrl, setupProblem, expectedSignature, parse, verify, handle, enable }
