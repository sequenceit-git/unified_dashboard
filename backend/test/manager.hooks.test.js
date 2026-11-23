const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('./helpers/stub')

/** The manager with a fake registry of two shops: 'a' has hooks/capabilities, 'b' has none. */
function load({ hooksA = {}, capsA = {}, serviceB = {} } = {}) {
  const calls = []
  const adapters = {
    a: { key: 'a', label: 'Shop A', service: { listingCapabilities: { canList: true }, getInventory: async (t, o) => { calls.push(['a.getInventory', o.limit]); return { inventoryItems: [] } } }, hooks: hooksA, capabilities: capsA },
    b: { key: 'b', label: 'Shop B', service: { getInventory: async (t, o) => { calls.push(['b.getInventory', o.limit]); return { inventoryItems: [{ externalListingId: '1', sku: 'S' }] } }, ...serviceB } },
  }
  const registry = { KEYS: ['a', 'b'], get: (k) => adapters[k], all: () => Object.values(adapters), canonical: (v) => v, listingUrl: () => '' }
  const restore = stubModules({
    '/marketplaces': registry,
    '../../marketplaces': registry,
    '/models/Order': modelStub(), '/models/Customer': modelStub(), '/models/SyncLog': modelStub(), '/models/Shop': modelStub(),
    '/models/Product': modelStub(), '/models/Listing': modelStub(), '/models/InventoryLog': modelStub(), '/models/IgnoredListing': modelStub(),
    '/models/Conversation': modelStub(), '/models/Message': modelStub(),
  })
  const manager = freshRequire('services/marketplace/index.js')
  return { manager, calls, restore }
}

test('fetchShopListings uses the shop hook when it has one', async () => {
  const fetchListings = async (mgr, shop) => ({ complete: true, items: [{ from: 'hook', shop: shop.marketplace }] })
  const { manager, calls, restore } = load({ hooksA: { fetchListings } })
  try {
    assert.deepEqual(await manager.fetchShopListings({ marketplace: 'a' }, 'tok'), { complete: true, items: [{ from: 'hook', shop: 'a' }] })
    assert.deepEqual(calls, [])
  } finally { restore() }
})

test('fetchShopListings uses listingFetchLimit, else 200', async () => {
  const { manager, calls, restore } = load({ capsA: { listingFetchLimit: 2000 } })
  try {
    await manager.fetchShopListings({ marketplace: 'a' }, 'tok')
    const res = await manager.fetchShopListings({ marketplace: 'b' }, 'tok')
    assert.deepEqual(calls, [['a.getInventory', 2000], ['b.getInventory', 200]])
    assert.equal(res.items[0].listingStatus, 'live')
  } finally { restore() }
})

test('listingCapabilities comes from the adapter service, with a safe default', () => {
  const { manager, restore } = load()
  try {
    assert.deepEqual(manager.listingCapabilities('a'), { canList: true })
    assert.deepEqual(manager.listingCapabilities('b'), { canList: false, editAfterListing: [] })
    assert.deepEqual(manager.listingCapabilities('zzz'), { canList: false, editAfterListing: [] })
  } finally { restore() }
})

test('getService throws for an unknown marketplace', () => {
  const { manager, restore } = load()
  try {
    assert.throws(() => manager.getService('zzz'), /Unsupported marketplace: zzz/)
  } finally { restore() }
})

test('autoConnectFromEnv runs every shop hook that has one', async () => {
  let ran = 0
  const { manager, restore } = load({ hooksA: { autoConnectFromEnv: async () => { ran += 1 } } })
  try {
    await manager.autoConnectFromEnv()
    assert.equal(ran, 1)
  } finally { restore() }
})
