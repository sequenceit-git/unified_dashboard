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
