const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('./helpers/stub')

test("scheduler runs the shop's own sync job", async () => {
  const ran = []
  const temuShop = { _id: 'T1', name: 'Temu store', marketplace: 'temu', status: 'connected' }
  const appFor = (key) => ({ sync: { orders: async (shop) => { ran.push([key, shop._id]); return { synced: 1 } } } })
  const restore = stubModules({
    '/models/Shop': modelStub(() => temuShop),
    '/notify': { fromSync: async () => {} },
    '../../marketplaces': { get: (key) => ({ app: appFor(key) }), KEYS: ['ebay', 'tiktok_shop', 'temu'], canonical: (k) => k },
  })
  try {
    const { runJob } = freshRequire('services/core/syncQueue.js')
    await runJob('orders', 'T1')
    assert.deepEqual(ran, [['temu', 'T1']])
  } finally {
    restore()
  }
})

test('SYNC_PAUSED=true skips every sync job, including webhook pushes', async () => {
  const ran = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 'T1', name: 'Temu store', marketplace: 'temu', status: 'connected' })),
    '/notify': { fromSync: async () => {} },
    '../../marketplaces': { get: () => ({ app: { sync: { orders: async () => { ran.push('orders') } } } }), KEYS: ['temu'], canonical: (k) => k },
  })
  process.env.SYNC_PAUSED = 'true'
  try {
    const { runJob, enqueue } = freshRequire('services/core/syncQueue.js')
    assert.deepEqual(await runJob('orders', 'T1'), { skipped: 'Sync is paused (SYNC_PAUSED=true)' })
    assert.deepEqual(await enqueue('orders', 'T1', { push: true }), { skipped: 'Sync is paused (SYNC_PAUSED=true)' })
    assert.deepEqual(ran, [])
  } finally {
    delete process.env.SYNC_PAUSED
    restore()
  }
})
