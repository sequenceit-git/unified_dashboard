/**
 * eBay's traffic report is rate-limited, and its numbers change once a day, not with each order. So
 * every traffic read goes through here, kept in Redis (process memory without REDIS_URL):
 * - `ebay-traffic:<shopId>:<name>` holds a read for an hour. It sits outside `shop:<shopId>:`,
 *   which every orders sync (each few minutes) clears.
 * - one read at a time per report across every backend process: a Redis lock (SET NX EX); the
 *   others wait for its result to land in Redis instead of calling eBay too
 * - `…:last:<name>` keeps the last good copy a week; it is served, marked stale, when eBay says too
 *   many requests
 * - `…:limited` (5-minute TTL) is set on a 429: until it expires no process asks eBay for this
 *   shop's traffic, since retries would only keep the limit going
 */
const cache = require('../../../services/core/cache')

const FRESH_SECONDS = 60 * 60
const KEEP_SECONDS = 7 * 24 * 60 * 60
const PAUSE_SECONDS = 5 * 60
const LOCK_SECONDS = 30
const WAIT_MS = 15 * 1000
const POLL_MS = 250

const limitedError = () => Object.assign(new Error('eBay limits how often traffic can be read. Try again in a few minutes.'), { status: 429 })
const present = (v) => v !== undefined && v !== null
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** `{ value, stale }` for the traffic report `name` (e.g. "day:2026-11-01:2026-11-07", "listings"). */
async function readTraffic(shop, name, load, { waitMs = WAIT_MS } = {}) {
  const base = `ebay-traffic:${shop._id}:`
  const key = base + name
  const lastKey = `${base}last:${name}`
  const fallback = async (err) => {
    const kept = await cache.get(lastKey)
    if (present(kept)) return { value: kept, stale: true }
    throw err
  }

  const hit = await cache.get(key)
  if (present(hit)) return { value: hit, stale: false }
  if (await cache.get(`${base}limited`)) return fallback(limitedError())

  // Another process (or request) is reading this report: wait for its result in Redis.
  if (!(await cache.claim(`${base}lock:${name}`, LOCK_SECONDS))) {
    for (let waited = 0; waited < waitMs; waited += POLL_MS) {
      await sleep(POLL_MS)
      const done = await cache.get(key)
      if (present(done)) return { value: done, stale: false }
      if (await cache.get(`${base}limited`)) return fallback(limitedError())
    }
    return fallback(limitedError())
  }

  try {
    const value = await load()
    await Promise.all([cache.set(key, value, FRESH_SECONDS), cache.set(lastKey, value, KEEP_SECONDS)])
    return { value, stale: false }
  } catch (err) {
    if (err?.status !== 429) throw err
    await cache.set(`${base}limited`, 1, PAUSE_SECONDS)
    return fallback(limitedError())
  } finally {
    await cache.del(`${base}lock:${name}`)
  }
}

module.exports = { readTraffic }
