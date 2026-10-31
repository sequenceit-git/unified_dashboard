/**
 * "New data" events, e.g. { type: 'sync', kind: 'inbox', shopId, marketplace, result }.
 * The sync worker publishes them over Redis pub/sub; the API relays them to open browsers.
 * Without Redis, both sides are the same process and an EventEmitter does the job.
 */

const { EventEmitter } = require('events')
const redis = require('./redis')

const CHANNEL = 'ecompilot:events'
const local = new EventEmitter()
local.setMaxListeners(0)
let subscriber = null

async function publish(event) {
  const payload = { ...event, at: new Date().toISOString() }
  const client = redis.getClient()
  if (!client) {
    local.emit('event', payload)
    return
  }
  try {
    await client.publish(CHANNEL, JSON.stringify(payload))
  } catch (err) {
    console.warn(`[events] could not publish ${event.type}: ${err.message}`)
  }
}

/** Calls `listener(event)` for every event; returns an unsubscribe function. */
function subscribe(listener) {
  if (redis.enabled() && !subscriber) {
    subscriber = redis.createConnection('events')
    subscriber.subscribe(CHANNEL).catch((err) => console.warn(`[events] subscribe failed: ${err.message}`))
    subscriber.on('message', (channel, raw) => {
      if (channel !== CHANNEL) return
      try {
        local.emit('event', JSON.parse(raw))
      } catch {
        // Ignore malformed messages.
      }
    })
  }
  local.on('event', listener)
  return () => local.off('event', listener)
}

module.exports = { publish, subscribe }
