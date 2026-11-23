/**
 * Temu webhooks ("live updates").
 *
 * The callback URL is set on the app in the Temu Partner Platform (ours: POST /api/temu/webhooks);
 * `bg.tmc.message.update` then turns the event codes below on for a shop.
 *
 * Temu's push (Webhook Integration Guide):
 * - headers `x-tm-app-key`, `x-tm-event-code`, `x-tm-timestamp` (ms), `x-tm-ext-param`, `x-tm-signature`
 * - body `{ "eventData": "<base64 AES-128-CBC>" }`, key and IV = the first 16 bytes of the app secret
 * - signature = hex HMAC-SHA256 (app secret) of the header values and the decrypted eventData,
 *   sorted by name. The guide's example joins them as `keyvalue...`; its sample code as
 *   `key=value&...`. Both are accepted (both need the secret).
 * - Temu wants HTTP 200 within 500 ms, so the push is checked, answered, and then handled.
 *
 * Each event only carries the shop's `mallId` and order numbers, so a push is a trigger: it queues
 * an orders sync, which reads the real data from Temu with the shop's own token.
 */

const crypto = require('crypto')
const config = require('./config')
const Shop = require('../../models/Shop')
const cache = require('../../services/cache')

const EVENTS = {
  bg_order_status_change_event: 'orders',
  bg_trade_logistics_address_changed: 'orders',
  bg_aftersales_status_change: 'orders',
  bg_cancel_order_status_change: 'orders',
  // Status or tracking change of a fulfillment order sent to a Temu cooperative warehouse.
  bg_cooperative_warehouse_erp_fulfill_change_push: 'orders',
}

const SIGNED_HEADERS = ['x-tm-app-key', 'x-tm-event-code', 'x-tm-timestamp', 'x-tm-ext-param']

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function decrypt(eventData, appSecret = config.appSecret) {
  const secret = Buffer.from(String(appSecret || ''), 'utf8')
  if (secret.length < 16) throw new Error('TEMU_APP_SECRET must be at least 16 characters to read webhooks')
  const key = secret.subarray(0, 16)
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, key)
  return Buffer.concat([decipher.update(Buffer.from(String(eventData), 'base64')), decipher.final()]).toString('utf8')
}

/** Both documented signature strings for these values. */
function expectedSignatures(values, appSecret = config.appSecret) {
  const keys = Object.keys(values).filter((key) => values[key] !== undefined && values[key] !== null && String(values[key]).trim() !== '').sort()
  const hmac = (text) => crypto.createHmac('sha256', String(appSecret || '')).update(text, 'utf8').digest('hex')
  return [
    hmac(keys.map((key) => `${key}${values[key]}`).join('')),
    hmac(keys.map((key) => `${key}=${values[key]}`).join('&')),
  ]
}

function signatureMatches(given, expected) {
  const a = Buffer.from(String(given || '').trim().toLowerCase(), 'utf8')
  return expected.some((sig) => {
    const b = Buffer.from(sig, 'utf8')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

/**
 * Checks and decrypts a push. Returns `{ status, message }` on failure, or
 * `{ status: 200, eventCode, data }`.
 */
function open(body, headers = {}) {
  if (!config.appKey || !config.appSecret) return { status: 503, message: 'Temu app key/secret are not set' }
  let payload = body
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(String(payload))
    } catch {
      return { status: 400, message: 'Invalid webhook body' }
    }
  }
  const eventData = payload?.eventData
  if (!eventData || typeof eventData !== 'string') return { status: 400, message: 'Missing eventData' }

  const appKey = header(headers, 'x-tm-app-key')
  if (appKey && appKey !== config.appKey) return { status: 401, message: 'Webhook is for another app' }

  let decrypted
  try {
    decrypted = decrypt(eventData)
  } catch {
    return { status: 401, message: 'Could not decrypt eventData' }
  }

  const values = { eventData: decrypted }
  for (const name of SIGNED_HEADERS) values[name] = header(headers, name)
  if (!signatureMatches(header(headers, 'x-tm-signature'), expectedSignatures(values))) {
    return { status: 401, message: 'Invalid signature' }
  }

  let data
  try {
    data = JSON.parse(decrypted)
  } catch {
    return { status: 400, message: 'eventData is not JSON' }
  }
  return { status: 200, eventCode: String(header(headers, 'x-tm-event-code') || '').trim(), data, signature: header(headers, 'x-tm-signature') }
}

/** Queues the sync for a checked push. Runs after the 200 has been sent. */
async function process(eventCode, data, signature) {
  const kind = EVENTS[eventCode.toLowerCase()] || (data?.parentOrderSn ? 'orders' : '')
  if (!kind) return { message: `Ignored Temu event ${eventCode || 'unknown'}` }
  // Temu retries until it gets a 200 in time; a late first try can arrive twice.
  if (signature && !(await cache.claim(`temu-wh:${signature}`, 24 * 60 * 60))) {
    return { message: `Duplicate Temu push ${eventCode} ignored` }
  }
  const mallId = String(data?.mallId ?? data?.mall_id ?? '').trim()
  if (!mallId) return { message: `Temu event ${eventCode} has no mallId; ignored` }

  const shop = await Shop.findOne({ marketplace: 'temu', externalShopId: mallId }).select('name status')
  if (!shop) return { message: `No Temu shop found for mall ${mallId}` }
  if (shop.status !== 'connected') return { message: `Shop ${shop.name} is not connected; ignored` }

  await require('../../services/syncQueue').enqueue(kind, shop._id, { push: true })
  return { message: `${eventCode}${data.parentOrderSn ? ` ${data.parentOrderSn}` : ''}: queued ${kind} sync for ${shop.name}`, job: kind }
}

/** For tests and callers that want the whole thing awaited. */
async function handle(body, headers = {}) {
  const opened = open(body, headers)
  if (opened.status !== 200) return opened
  return { status: 200, ...(await process(opened.eventCode, opened.data, opened.signature)) }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isTokenError = (err) => Boolean(err?.deadLogin || err?.status === 401
  || (/access.?token/i.test(err?.message || '') && !/event access/i.test(err?.message || '')))

/** Turns the webhook events on for a shop (on connect and once a day). */
async function enable(shop) {
  const manager = require('../../services/marketplace')
  const temu = require('./service')
  const events = Object.keys(EVENTS)
  let liveUpdates
  try {
    const subscribed = []
    const skipped = []
    await manager.withShopToken(shop, async (token) => {
      subscribed.length = 0
      skipped.length = 0
      try {
        await temu.call('bg.tmc.message.update', { access_token: token, permitEventCodeList: events })
        subscribed.push(...events)
      } catch (err) {
        if (isTokenError(err)) throw err
        // One event the seller didn't authorize fails the whole list: try them one by one.
        for (const code of events) {
          await delay(1100) // Temu allows about one call a second here (error 110020007).
          try {
            await temu.call('bg.tmc.message.update', { access_token: token, permitEventCodeList: [code] })
            subscribed.push(code)
          } catch (inner) {
            if (isTokenError(inner)) throw inner
            skipped.push({ eventType: code, error: inner.message })
          }
        }
      }
    })
    if (!subscribed.length) {
      throw new Error(skipped[0]?.error || 'No Temu webhook events could be turned on.')
    }
    liveUpdates = {
      enabled: true,
      events: subscribed,
      // Temu pushes order changes only; listings keep their normal schedule.
      covers: ['orders'],
      ...(skipped.length ? { skipped } : {}),
      enabledAt: new Date(),
      checkedAt: new Date(),
    }
  } catch (err) {
    liveUpdates = { enabled: false, error: err.message, checkedAt: new Date() }
  }
  await Shop.updateOne({ _id: shop._id }, { liveUpdates })
  return { liveUpdates: liveUpdates.enabled ? 'on' : 'off', reason: liveUpdates.error || undefined, events: liveUpdates.events }
}

module.exports = { open, process, handle, enable, decrypt, expectedSignatures, EVENTS }
