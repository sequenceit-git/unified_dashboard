/**
 * Shared Redis connection. Redis is optional: without REDIS_URL the cache lives in memory and
 * sync jobs run inside the API process, which is fine for local development.
 */

const { Redis } = require('ioredis')

let client = null
let warned = false

function enabled() {
  return Boolean(process.env.REDIS_URL)
}

/**
 * A new connection; BullMQ workers and pub/sub subscribers each need their own.
 * `failFast` connections reject commands while Redis is down instead of queueing them,
 * so a Redis outage slows nothing in the API; BullMQ connections must wait instead.
 */
function createConnection(name, { failFast = false } = {}) {
  const connection = new Redis(process.env.REDIS_URL, {
    connectionName: `ecompilot-${name}`,
    ...(failFast
      ? { maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 1500 }
      : { maxRetriesPerRequest: null }),
  })
  connection.on('error', (err) => {
    if (warned) return
    warned = true
    console.warn(`[redis] ${err.message}`)
  })
  connection.on('ready', () => { warned = false })
  return connection
}

function getClient() {
  if (!enabled()) return null
  if (!client) client = createConnection('client', { failFast: true })
  return client
}

module.exports = { enabled, createConnection, getClient }
