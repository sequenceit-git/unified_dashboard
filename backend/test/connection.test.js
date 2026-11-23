const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('./helpers/stub')

/** The shared connection code with a fake registry of two shops: 'a' has hooks, 'b' has none. */
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
  const manager = freshRequire('services/marketplace/connection.js')
  return { manager, calls, restore }
}

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
