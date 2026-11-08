/**
 * Background loading of new marketplace data (inbox, orders, listings, API access).
 *
 * With REDIS_URL set, jobs go to a BullMQ queue that the sync worker (`node worker.js`) runs, so
 * slow marketplace calls never block the API. Without Redis, the same jobs run inside the API
 * process. After every job the affected cache is cleared and a `sync` event tells open
 * browsers to reload.
 */

const { Queue, QueueEvents, Worker } = require('bullmq')
const Shop = require('../models/Shop')
const redis = require('./redis')
const cache = require('./cache')
const events = require('./events')

const QUEUE = 'marketplace-sync'
const isProduction = () => process.env.NODE_ENV === 'production'

/** Env flag `NAME=true|false`, defaulting to on in production. */
function autoSync(name) {
  return process.env[name] ? process.env[name] === 'true' : isProduction()
}

const manager = () => require('./marketplace')

/**
 * `every` is the schedule in minutes (0 = manual only). `clears` are cache prefixes made stale.
 * `applies` skips shops whose API can't do the job, so the logs stay quiet.
 */
const KINDS = {
  inbox: {
    every: () => (autoSync('INBOX_AUTO_SYNC') ? Number(process.env.INBOX_SYNC_MINUTES || 5) : 0),
    applies: (shop) => ['ebay', 'tiktok_shop'].includes(shop.marketplace) && shop.apiAccess?.inbox?.ok !== false,
    run: (shop) => require('./inboxBot').syncAndReply(shop),
    clears: () => ['resp:dashboard:'],
  },
  orders: {
    every: () => (autoSync('ORDER_AUTO_SYNC') ? Number(process.env.ORDER_SYNC_MINUTES || 10) : 0),
    applies: () => true,
    run: (shop) => manager().syncOrdersForShop(shop),
    clears: (shop) => [`shop:${shop._id}:`, 'resp:analytics:', 'resp:dashboard:'],
  },
  listings: {
    every: () => (autoSync('LISTING_AUTO_SYNC') ? Number(process.env.LISTING_SYNC_MINUTES || 15) : 0),
    applies: () => true,
    run: (shop) => manager().syncListingsForShop(shop),
    clears: () => ['resp:analytics:', 'resp:dashboard:'],
  },
  access: {
    every: () => (autoSync('ACCESS_AUTO_CHECK') ? 12 * 60 : 0),
    applies: () => true,
    run: (shop) => manager().checkShopAccess(shop),
    clears: () => [],
  },
  // Re-subscribes eBay shops to push notifications once a day (and on connect).
  live: {
    every: () => (autoSync('ACCESS_AUTO_CHECK') ? 24 * 60 : 0),
    applies: (shop) => shop.marketplace === 'ebay',
    run: (shop) => require('./ebayNotifications').enable(shop),
    clears: () => [],
  },
  full: {
    every: () => 0,
    applies: () => true,
    run: (shop) => manager().syncAllForShop(shop),
    clears: (shop) => [`shop:${shop._id}:`, 'resp:analytics:', 'resp:dashboard:'],
  },
}

const lastErrors = new Map()

function logResult(kind, shop, result) {
  const error = result?.error || result?.orders?.error || result?.listings?.error || ''
  const key = `${kind}:${shop._id}`
  if (error && lastErrors.get(key) !== error) console.warn(`[sync] ${kind} ${shop.name}: ${error}`)
  lastErrors.set(key, error)
}

/** Runs one job for one shop: the marketplace call, cache clean-up and the browser event. */
async function runJob(kind, shopId) {
  const spec = KINDS[kind]
  if (!spec) throw new Error(`Unknown sync job ${kind}`)
  const shop = await Shop.findById(shopId)
  if (!shop || shop.status !== 'connected') return { skipped: 'Shop is not connected' }
  if (!spec.applies(shop)) return { skipped: `${kind} is not available for ${shop.name}` }

  let result
  try {
    result = await spec.run(shop)
  } catch (err) {
    result = { error: err.message }
  }
  logResult(kind, shop, result)
  await require('./notify').fromSync(kind, shop, result).catch((err) => console.warn(`[notify] ${err.message}`))
  await Promise.all(spec.clears(shop).map((prefix) => cache.invalidate(prefix)))
  await events.publish({
    type: 'sync',
    kind,
    shopId: String(shop._id),
    marketplace: shop.marketplace,
    ok: !result?.error,
    newMessages: result?.newMessages || 0,
  })
  return JSON.parse(JSON.stringify(result ?? {}))
}

/**
 * Shops with eBay live updates get new sales and messages pushed, so their scheduled syncs only
 * run every so often as a backup, in case eBay misses a notification.
 */
const BACKUP_MINUTES = {
  orders: () => Number(process.env.ORDER_BACKUP_MINUTES || 30),
  inbox: () => Number(process.env.INBOX_BACKUP_MINUTES || 15),
  listings: () => Number(process.env.LISTING_BACKUP_MINUTES || 60),
}

async function dueForSchedule(kind, shop) {
  if (!BACKUP_MINUTES[kind] || !shop.liveUpdates?.enabled) return true
  return cache.claim(`backup-sync:${kind}:${shop._id}`, BACKUP_MINUTES[kind]() * 60)
}

/** Shops a scheduled `kind` run should cover now. */
async function connectedShopIds(kind) {
  const shops = await Shop.find({ status: 'connected' }).select('marketplace apiAccess name liveUpdates')
  const ids = []
  for (const shop of shops) {
    if (KINDS[kind].applies(shop) && await dueForSchedule(kind, shop)) ids.push(String(shop._id))
  }
  return ids
}

// ---- Without Redis: run in this process, one job per shop and kind at a time. ----

const running = new Map()
const rerun = new Set()

/** With `after`, a run already in progress is followed by one more, so news since it began isn't missed. */
function runInline(kind, shopId, { after = false } = {}) {
  const key = `${kind}:${shopId}`
  if (running.has(key)) {
    if (after) rerun.add(key)
    return running.get(key)
  }
  const promise = runJob(kind, shopId).finally(() => {
    running.delete(key)
    if (rerun.delete(key)) runInline(kind, shopId).catch(() => {})
  })
  running.set(key, promise)
  return promise
}

// ---- With Redis: BullMQ. ----

let queue = null
let queueEvents = null

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE, {
      connection: redis.createConnection('queue'),
      defaultJobOptions: { removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 24 * 3600 } },
    })
    queue.on('error', (err) => console.warn(`[sync] queue: ${err.message}`))
  }
  return queue
}

function getQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE, { connection: redis.createConnection('queue-events') })
    queueEvents.on('error', (err) => console.warn(`[sync] queue events: ${err.message}`))
  }
  return queueEvents
}

/**
 * Asks for a sync of one shop. A job already waiting or running for the same shop and kind is
 * reused, so repeated clicks don't pile up. With `wait`, resolves with the job's result, or
 * `{ queued: true }` when it takes longer than `timeoutMs` (the job keeps running on the worker).
 */
async function enqueue(kind, shopId, { wait = false, timeoutMs = 15000, push = false } = {}) {
  if (!KINDS[kind]) throw new Error(`Unknown sync job ${kind}`)
  const id = String(shopId)
  if (push) return enqueuePush(kind, id)
  if (!redis.enabled()) {
    const promise = runInline(kind, id)
    if (!wait) {
      promise.catch(() => {})
      return { queued: true }
    }
    return promise
  }

  try {
    const job = await getQueue().add(kind, { shopId: id }, { deduplication: { id: `${kind}-${id}` } })
    if (!wait) return { queued: true, jobId: job.id }
    try {
      return await job.waitUntilFinished(getQueueEvents(), timeoutMs)
    } catch (err) {
      // A worker is on it: leave the job running there (its `sync` event refreshes the page).
      // Running it here too would load the same shop twice at once.
      const workers = await getQueue().getWorkersCount().catch(() => 1)
      if (workers > 0) return { queued: true, jobId: job.id }
      // No worker at all: take the job off the queue so it doesn't run again later, then run it here.
      console.warn(`[syncQueue] No sync worker for ${kind}-${id} (${err.message}). Running it in the API process.`)
      const removed = await job.remove().then(() => true, () => false)
      if (!removed) return { queued: true, jobId: job.id }
      return await runInline(kind, id)
    }
  } catch (err) {
    console.warn(`[syncQueue] Redis enqueue error (${err.message}). Falling back to inline execution...`)
    if (typeof redis.disable === 'function') redis.disable(err.message)
    const promise = runInline(kind, id)
    if (!wait) {
      promise.catch(() => {})
      return { queued: true }
    }
    return promise
  }
}

const PUSH_DELAY_MS = 5000

/**
 * A marketplace told us something changed (e.g. an eBay sale). The sync must start after now:
 * a run already in progress may have fetched before the change. Bursts within a few seconds
 * share one job. Never waits.
 */
async function enqueuePush(kind, id) {
  if (redis.enabled()) {
    try {
      const job = await getQueue().add(kind, { shopId: id }, {
        delay: PUSH_DELAY_MS,
        deduplication: { id: `${kind}-${id}-push`, ttl: PUSH_DELAY_MS },
      })
      return { queued: true, jobId: job.id }
    } catch (err) {
      console.warn(`[syncQueue] Redis enqueue error (${err.message}). Running the push sync inline...`)
    }
  }
  runInline(kind, id, { after: true }).catch(() => {})
  return { queued: true }
}

/** Queues `kind` for every connected shop it applies to. */
async function enqueueAll(kind) {
  const ids = await connectedShopIds(kind)
  for (const id of ids) await enqueue(kind, id)
  return ids.length
}

/** Without Redis: timers in this process. With Redis the worker owns the schedules. */
function startInlineSchedules() {
  for (const [kind, spec] of Object.entries(KINDS)) {
    const minutes = spec.every()
    if (!(minutes > 0)) continue
    const tick = async () => {
      for (const id of await connectedShopIds(kind).catch(() => [])) await runInline(kind, id).catch(() => {})
    }
    setInterval(tick, minutes * 60 * 1000)
    setTimeout(tick, 30 * 1000)
    console.log(`[sync] ${kind} every ${minutes} minute(s), in the API process`)
  }
}

/** The sync worker: runs queued jobs and keeps the repeating schedules up to date. */
async function startWorker() {
  if (!redis.enabled()) throw new Error('The sync worker needs REDIS_URL.')
  const concurrency = Number(process.env.SYNC_CONCURRENCY || 1)
  const worker = new Worker(
    QUEUE,
    async (job) => (job.name === 'schedule' ? { queued: await enqueueAll(job.data.kind) } : runJob(job.name, job.data.shopId)),
    { connection: redis.createConnection('worker'), concurrency },
  )
  worker.on('failed', (job, err) => console.warn(`[sync] ${job?.name} failed: ${err.message}`))
  worker.on('error', (err) => console.warn(`[sync] worker: ${err.message}`))

  const q = getQueue()
  for (const [kind, spec] of Object.entries(KINDS)) {
    const minutes = spec.every()
    if (minutes > 0) {
      await q.upsertJobScheduler(`schedule-${kind}`, { every: minutes * 60 * 1000 }, { name: 'schedule', data: { kind } })
      console.log(`[sync] ${kind} every ${minutes} minute(s)`)
    } else {
      await q.removeJobScheduler(`schedule-${kind}`)
    }
  }
  console.log(`[sync] worker ready (concurrency ${concurrency})`)
  return worker
}

module.exports = { KINDS, enqueue, enqueueAll, runJob, startInlineSchedules, startWorker }
