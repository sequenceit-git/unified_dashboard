/**
 * Small JSON cache: Redis when REDIS_URL is set, otherwise process memory.
 * Keys are grouped by prefix (`shop:<id>:...`, `resp:analytics:...`) so a sync can drop
 * everything it made stale with `invalidate(prefix)`. Cache errors never fail a request.
 */

const crypto = require('crypto')
const redis = require('./redis')

const PREFIX = 'ecompilot:cache:'
const memory = new Map()
const inflight = new Map()

function memoryGet(key) {
  const entry = memory.get(key)
  if (!entry) return undefined
  if (entry.expires < Date.now()) {
    memory.delete(key)
    return undefined
  }
  return entry.value
}

async function get(key) {
  const client = redis.getClient()
  if (!client) return memoryGet(key)
  try {
    const raw = await client.get(PREFIX + key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

async function set(key, value, ttlSeconds) {
  const client = redis.getClient()
  if (!client) {
    memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 })
    return
  }
  try {
    await client.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // A failed cache write only costs a slower next request.
  }
}

/** Removes every key starting with `prefix`. */
async function invalidate(prefix) {
  const client = redis.getClient()
  if (!client) {
    for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key)
    return
  }
  try {
    let cursor = '0'
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${PREFIX}${prefix}*`, 'COUNT', 200)
      if (keys.length) await client.unlink(...keys)
      cursor = next
    } while (cursor !== '0')
  } catch (err) {
    console.warn(`[cache] could not clear ${prefix}: ${err.message}`)
  }
}

/** Returns the cached value or computes it once, even when many requests ask at the same time. */
async function wrap(key, ttlSeconds, compute) {
  const cached = await get(key)
  if (cached !== undefined) return cached
  if (inflight.has(key)) return inflight.get(key)
  const promise = Promise.resolve()
    .then(compute)
    .then(async (value) => {
      if (value !== undefined) await set(key, value, ttlSeconds)
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/** True the first time it's called for `key` within `ttlSeconds`; used to space out API calls. */
async function claim(key, ttlSeconds) {
  const client = redis.getClient()
  if (!client) {
    if (memoryGet(key) !== undefined) return false
    memory.set(key, { value: 1, expires: Date.now() + ttlSeconds * 1000 })
    return true
  }
  try {
    return (await client.set(PREFIX + key, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
  } catch {
    return true
  }
}

/**
 * Express middleware caching successful JSON responses per user scope and URL.
 * `group` is the invalidation prefix, e.g. 'analytics'.
 */
function cachedResponse(group, ttlSeconds) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next()
    const user = req.authUser || req.user || {}
    const scope = user.role === 'sub_admin' ? `sub:${(req.allowedShopIds || []).map(String).sort().join(',')}` : 'admin'
    const hash = crypto.createHash('sha1').update(`${scope}|${req.originalUrl}`).digest('hex').slice(0, 20)
    const key = `resp:${group}:${hash}`
    const hit = await get(key)
    if (hit !== undefined) {
      res.set('X-Cache', 'HIT')
      return res.json(hit)
    }
    const send = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode === 200) set(key, body, ttlSeconds)
      res.set('X-Cache', 'MISS')
      return send(body)
    }
    next()
  }
}

module.exports = { get, set, invalidate, wrap, claim, cachedResponse }
