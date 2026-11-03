/**
 * Shared Redis connection. Redis is optional: without REDIS_URL the cache lives in memory and
 * sync jobs run inside the API process, which is fine for local development.
 */

const { Redis } = require('ioredis')

let client = null
let warned = false
let redisDisabled = false

function getResolvedUrl() {
  const url = process.env.REDIS_URL
  if (!url) return null
  // When running outside Docker container, resolve 'redis' service hostname to localhost fallback
  if (url.includes('redis:6379')) {
    const dns = require('dns')
    try {
      // If redis host doesn't exist in local DNS, substitute with 127.0.0.1
      require('child_process').execSync('node -e "require(\'dns\').lookup(\'redis\', (e) => process.exit(e ? 1 : 0))"', { stdio: 'ignore' })
    } catch {
      return url.replace('redis:6379', '127.0.0.1:6379')
    }
  }
  return url
}

function enabled() {
  return Boolean(process.env.REDIS_URL) && !redisDisabled
}

function disable(reason = '') {
  if (!redisDisabled) {
    redisDisabled = true
    console.warn(`[redis] Redis temporarily disabled (${reason || 'unavailable'}); falling back to inline mode.`)
  }
}

/**
 * A new connection; BullMQ workers and pub/sub subscribers each need their own.
 * `failFast` connections reject commands while Redis is down instead of queueing them,
 * so a Redis outage slows nothing in the API; BullMQ connections must wait instead.
 */
function createConnection(name, { failFast = false } = {}) {
  const targetUrl = getResolvedUrl() || process.env.REDIS_URL
  const connection = new Redis(targetUrl, {
    connectionName: `ecompilot-${name}`,
    enableOfflineQueue: !failFast,
    maxRetriesPerRequest: failFast ? 1 : 3,
    connectTimeout: 3000,
    retryStrategy(times) {
      if (times > 3) {
        disable('Connection refused after 3 retries')
        return null // Stop retrying and fail cleanly
      }
      return Math.min(times * 500, 2000)
    },
  })
  connection.on('error', (err) => {
    if (warned) return
    warned = true
    console.warn(`[redis] ${err.message}`)
  })
  connection.on('ready', () => {
    warned = false
    redisDisabled = false
  })
  return connection
}

function getClient() {
  if (!enabled()) return null
  if (!client) client = createConnection('client', { failFast: true })
  return client
}

module.exports = { enabled, disable, createConnection, getClient }
