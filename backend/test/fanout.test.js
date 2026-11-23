const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

/** Listings of product P: one on an eBay store (A), one on a Temu store (B). */
function setup() {
  const calls = []
  const listing = (id, shopId, marketplace) => ({ _id: id, shopId, marketplace, externalListingId: `x-${id}`, stock: 5, status: 'live', save: async () => {} })
  const listings = [listing('L1', 'A', 'ebay'), listing('L2', 'B', 'temu')]
  const shops = { A: { _id: 'A', name: 'eBay store', marketplace: 'ebay', status: 'connected' }, B: { _id: 'B', name: 'Temu store', marketplace: 'temu', status: 'connected' } }
  const appFor = (key) => ({
    catalog: {
      pushStock: async (shop, l, product, quantity) => { calls.push(['pushStock', key, l._id, quantity]); return {} },
      pushChanges: async (shop, l, product, changes) => { calls.push(['pushChanges', key, l._id, changes]); return {} },
    },
  })
  const restore = stubModules({
    '/models/Listing': { find: async (q) => listings.filter((l) => (!q.shopId || l.shopId !== q.shopId.$ne) && (!q._id || l._id === q._id) && (!q.status?.$in || q.status.$in.includes(l.status)) && (!q.marketplace || q.marketplace.$in.includes(l.marketplace))) },
    '/models/Shop': { findById: async (id) => shops[id] },
    '../../marketplaces': { get: (key) => ({ app: appFor(key), capabilities: {} }), all: () => [], KEYS: ['ebay', 'temu'] },
  })
  return { calls, restore, fanOut: freshRequire('services/catalog/fanOut.js') }
}

test("fan-out pushes stock to every other shop's listing", async () => {
  const { calls, restore, fanOut } = setup()
  try {
    const results = await fanOut.propagateStock({ _id: 'P', sku: 'S', stock: 3 }, { exceptShopId: 'A' })
    assert.deepEqual(calls, [['pushStock', 'temu', 'L2', 3]])
    assert.deepEqual(results, [{ shopName: 'Temu store', ok: true }])
  } finally {
    restore()
  }
})

test('product changes reach each listing through its own shop', async () => {
  const { calls, restore, fanOut } = setup()
  try {
    const results = await fanOut.pushProductChanges({ _id: 'P', sku: 'S' }, { price: 9 })
    assert.deepEqual(calls, [['pushChanges', 'ebay', 'L1', { price: 9 }], ['pushChanges', 'temu', 'L2', { price: 9 }]])
    assert.equal(results.length, 2)
  } finally {
    restore()
  }
})
