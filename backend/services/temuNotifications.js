/**
 * Temu webhooks ("live updates").
 *
 * The callback URL is set on the app in the Temu Partner Platform (ours: POST /api/temu/webhooks);
 * `bg.tmc.message.update` then turns the event codes below on for a shop. Every event only carries
 * the shop's `mallId` and order numbers, so a push is treated as a hint: the handler finds the
 * connected shop by `mallId` and queues an orders sync, which fetches the real data from Temu with
 * the shop's own token. Nothing in the push body is written to the database.
 *
 * Temu does not document how pushes are signed, so they are not verified yet. A forged push can
 * at most start an extra sync for a shop (bursts share one job). The first pushes each day log
 * their header names and body keys so the signature check can be added once it is known.
 */

const Shop = require('../models/Shop')
const cache = require('./cache')

const EVENTS = {
  bg_order_status_change_event: 'orders',
  bg_trade_logistics_address_changed: 'orders',
  bg_aftersales_status_change: 'orders',
  bg_cancel_order_status_change: 'orders',
}

const EVENT_KEYS = ['type', 'eventCode', 'event_code', 'eventType', 'event_type', 'messageType', 'msgType', 'topic', 'event']
const NESTED_KEYS = ['data', 'message', 'msg', 'content', 'body', 'payload', 'request']

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

/** The body and the objects nested in it (Temu may wrap the event in `data`/`message`, possibly as a JSON string). */
function candidates(body) {
  const out = []
  const visit = (value, depth) => {
    const parsed = parseMaybeJson(value)
    if (!parsed || typeof parsed !== 'object' || depth > 2) return
    if (Array.isArray(parsed)) {
      parsed.slice(0, 5).forEach((item) => visit(item, depth + 1))
      return
    }
    out.push(parsed)
    for (const key of NESTED_KEYS) if (parsed[key] !== undefined) visit(parsed[key], depth + 1)
  }
  visit(body, 0)
  return out
}

function firstField(objects, keys) {
  for (const obj of objects) {
    for (const key of keys) {
      const value = obj[key]
      if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') return String(value).trim()
    }
  }
  return ''
}

function describeEvent(body) {
  const objects = candidates(body)
  const code = firstField(objects, EVENT_KEYS)
  const mallId = firstField(objects, ['mallId', 'mall_id'])
  const parentOrderSn = firstField(objects, ['parentOrderSn', 'parent_order_sn'])
  let kind = EVENTS[code.toLowerCase()] || ''
  if (!kind && parentOrderSn) kind = 'orders'
  return { code, mallId, parentOrderSn, kind }
}

/** Logs what Temu sends (header names, body keys — no values) once a day, to learn the push format. */
async function logShape(headers, body) {
  if (!(await cache.claim('temu-wh:shape', 24 * 60 * 60))) return
  const headerNames = Object.keys(headers || {}).sort().join(', ')
  const bodyKeys = candidates(body).map((obj) => Object.keys(obj).join('|')).join(' / ')
  console.info(`[temu-webhook] push headers: ${headerNames}; body keys: ${bodyKeys || '(none)'}`)
}

async function handle(body, headers = {}) {
  const payload = parseMaybeJson(body)
  if (!payload || typeof payload !== 'object') {
    return { status: 400, message: 'Invalid webhook body' }
  }
  await logShape(headers, payload).catch(() => {})

  const { code, mallId, parentOrderSn, kind } = describeEvent(payload)
  if (!kind) {
    return { status: 200, message: `Ignored Temu event ${code || 'unknown'}` }
  }
  if (!mallId) {
    return { status: 200, message: `Temu event ${code || kind} has no mallId; ignored` }
  }

  const shop = await Shop.findOne({ marketplace: 'temu', externalShopId: mallId }).select('name status')
  if (!shop) {
    return { status: 200, message: `No Temu shop found for mall ${mallId}` }
  }
  if (shop.status !== 'connected') {
    return { status: 200, message: `Shop ${shop.name} is not connected; ignored` }
  }

  await require('./syncQueue').enqueue(kind, shop._id, { push: true })
  return {
    status: 200,
    message: `${code || kind}${parentOrderSn ? ` ${parentOrderSn}` : ''}: queued ${kind} sync for ${shop.name}`,
    job: kind,
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isTokenError = (err) => err?.deadLogin || err?.status === 401 || /access.?token/i.test(err?.message || '')
  && !/event access/i.test(err?.message || '')

/** Turns the webhook events on for a shop (on connect and once a day). */
async function enable(shop) {
  const manager = require('./marketplace')
  const temu = require('./marketplace/temu')
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

module.exports = { handle, enable, describeEvent, EVENTS }
