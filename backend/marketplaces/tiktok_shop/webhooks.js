/**
 * TikTok Shop Webhooks ("live updates").
 *
 * TikTok Shop POSTs signed JSON notifications (`Authorization` = lowercase hex HMAC-SHA256
 * of `appKey + rawBody` using `appSecret`) when orders, packages, returns, cancellations,
 * products, or customer service messages change. The handler verifies the signature and queues
 * the matching sync job on `syncQueue`.
 */

const crypto = require('crypto')
const config = require('./config')
const Shop = require('../../models/Shop')
const cache = require('../../services/core/cache')

const EVENTS = {
  ORDER_STATUS_CHANGE: 'orders',
  RECIPIENT_ADDRESS_UPDATE: 'orders',
  CANCELLATION_STATUS_CHANGE: 'orders',
  RETURN_STATUS_CHANGE: 'orders',
  REVERSE_STATUS_UPDATE: 'orders',
  PACKAGE_UPDATE: 'orders',
  PRODUCT_STATUS_CHANGE: 'listings',
  PRODUCT_INFORMATION_CHANGE: 'listings',
  PRODUCT_CREATION: 'listings',
  PRODUCT_CATEGORY_CHANGE: 'listings',
  PRODUCT_AUDIT_STATUS_CHANGE: 'listings',
  NEW_MESSAGE: 'inbox',
  NEW_CONVERSATION: 'inbox',
  SELLER_DEAUTHORIZATION: 'deauth',
}

function notifyUrl() {
  const explicit = String(process.env.TIKTOK_WEBHOOK_URL || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const base = String(process.env.PUBLIC_URL || String(process.env.CLIENT_URL || '').split(',')[0] || '').trim().replace(/\/+$/, '')
  if (!/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/i.test(base)) return ''
  return `${base}/api/tiktok/webhooks`
}

function setupProblem() {
  if (!config.appKey || !config.appSecret) {
    return 'Set TIKTOK_SHOP_APP_KEY and TIKTOK_SHOP_APP_SECRET on the server.'
  }
  if (!notifyUrl()) {
    return 'Set TIKTOK_WEBHOOK_URL (or PUBLIC_URL) to the public https address of the API.'
  }
  return ''
}

function expectedSignature(rawBody, appKey = config.appKey, appSecret = config.appSecret) {
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8')
  const payload = Buffer.concat([Buffer.from(String(appKey || ''), 'utf8'), bodyBuf])
  return crypto.createHmac('sha256', String(appSecret || '')).update(payload).digest('hex')
}

function verify(rawBody, authHeader) {
  if (!rawBody || !authHeader || !config.appKey || !config.appSecret) return false
  const givenStr = String(authHeader).trim().toLowerCase()
  const expectedStr = expectedSignature(rawBody)
  const expected = Buffer.from(expectedStr, 'utf8')
  const given = Buffer.from(givenStr, 'utf8')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

function resolveKind(topic, payload) {
  const normalized = String(topic || '').trim().toUpperCase()
  if (normalized && EVENTS[normalized]) return EVENTS[normalized]
  const data = payload?.data || {}
  const type = Number(payload?.type)
  if (data.conversation_id || data.message_id || type === 14) return 'inbox'
  if (data.product_id) return 'listings'
  if (
    data.order_id
    || data.package_id
    || data.return_id
    || data.cancel_id
    || data.reverse_order_id
    || type === 1
    || type === 2
  ) return 'orders'
  if (type === 6) return 'deauth'
  return ''
}

async function findShop(shopId, { allowFallback = true } = {}) {
  const id = String(shopId || '').trim()
  if (id) {
    return Shop.findOne({ marketplace: 'tiktok_shop', externalShopId: id })
      .select('name marketplace status')
  }
  if (!allowFallback) return null
  const shops = await Shop.find({ marketplace: 'tiktok_shop', status: 'connected' })
    .select('name marketplace status')
    .limit(2)
  return shops.length === 1 ? shops[0] : null
}

async function handle(rawBody, body, authHeader, topicQuery = '') {
  if (!rawBody || (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') || rawBody.length === 0) {
    return { status: 400, message: 'Missing raw webhook body' }
  }
  if (!verify(rawBody, authHeader)) {
    return { status: 401, message: 'Invalid signature' }
  }

  let payload = body
  if (!payload || typeof payload !== 'object') {
    try {
      payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody))
    } catch {
      return { status: 400, message: 'Invalid JSON webhook body' }
    }
  }

  if (payload.tts_notification_id) {
    const firstSeen = await cache.claim(`tt-wh:${payload.tts_notification_id}`, 600)
    if (!firstSeen) {
      return { status: 200, message: `Duplicate notification ${payload.tts_notification_id} ignored` }
    }
  }

  const topic = String(topicQuery || payload.event_type || '').trim().toUpperCase()
  const kind = resolveKind(topic, payload)
  if (!kind) {
    return { status: 200, message: `Ignored TikTok event ${topic || payload.type || 'unknown'}` }
  }

  const shop = await findShop(payload.shop_id, { allowFallback: kind !== 'deauth' })
  if (!shop) {
    return { status: 200, message: `No TikTok Shop found for ${payload.shop_id || 'unknown shop'}` }
  }

  if (kind === 'deauth') {
    await Shop.updateOne(
      { _id: shop._id },
      { status: 'error', authError: 'TikTok Shop app was deauthorized.' },
    ).catch(() => {})
    return { status: 200, message: `Marked ${shop.name} deauthorized`, job: 'deauth' }
  }

  if (shop.status !== 'connected') {
    return { status: 200, message: `Shop ${shop.name} is not connected; ignored` }
  }

  await require('../../services/core/syncQueue').enqueue(kind, shop._id, { push: true })
  return { status: 200, message: `${topic || kind}: queued ${kind} sync for ${shop.name}`, job: kind }
}

async function enable(shop) {
  const manager = require('../../services/marketplace')
  const tiktok = require('./service')
  const problem = setupProblem()
  const events = Object.keys(EVENTS)
  let liveUpdates
  if (problem) {
    liveUpdates = { enabled: false, error: problem, checkedAt: new Date() }
  } else {
    try {
      const baseUrl = notifyUrl()
      const subscribed = []
      const skipped = []
      await manager.withShopToken(shop, async (token) => {
        subscribed.length = 0
        skipped.length = 0
        for (const eventType of events) {
          const sep = baseUrl.includes('?') ? '&' : '?'
          const address = `${baseUrl}${sep}topic=${eventType}`
          if (address.length > 255) {
            throw new Error(`Webhook URL exceeds TikTok's 255-character limit (${address.length}).`)
          }
          try {
            await tiktok.updateWebhook(token, { address, eventType, shop })
            subscribed.push(eventType)
          } catch (err) {
            if (err.deadLogin || err.status === 401 || /expired|invalid access.?token/i.test(err.message || '')) {
              throw err
            }
            skipped.push({ eventType, error: err.message })
          }
        }
      })
      if (!subscribed.length) {
        throw new Error(skipped[0]?.error || 'No TikTok Shop webhooks could be subscribed.')
      }
      liveUpdates = {
        enabled: true,
        url: baseUrl,
        events: subscribed,
        ...(skipped.length ? { skipped } : {}),
        enabledAt: new Date(),
        checkedAt: new Date(),
      }
    } catch (err) {
      liveUpdates = { enabled: false, error: err.message, checkedAt: new Date() }
    }
  }
  await Shop.updateOne({ _id: shop._id }, { liveUpdates })
  return { liveUpdates: liveUpdates.enabled ? 'on' : 'off', reason: liveUpdates.error || undefined, events: liveUpdates.events }
}

module.exports = { EVENTS, notifyUrl, setupProblem, expectedSignature, verify, resolveKind, handle, enable }
