const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

test("fetchShopListings uses eBay's own listing fetch (hooks.fetchListings)", async () => {
  const calls = []
  const adapter = {
    service: { getInventory: async (token, o) => { calls.push(['getInventory', o.limit]); return { inventoryItems: [{ externalListingId: '1', sku: 'S' }] } } },
    hooks: { fetchListings: async () => { calls.push(['hook']); return { complete: true, items: [] } } },
    capabilities: {},
  }
  const models = Object.fromEntries(['Order', 'Customer', 'SyncLog', 'Shop', 'Product', 'Listing', 'InventoryLog', 'IgnoredListing', 'Conversation', 'Message'].map((m) => [`/models/${m}`, modelStub()]))
  const restore = stubModules({ ...models, '..': adapter })
  try {
    const manager = freshRequire('marketplaces/ebay/app/manager.js')
    const res = await manager.fetchShopListings({ marketplace: 'ebay' }, 'tok')
    assert.deepEqual(calls, [['hook']])
    assert.deepEqual(res, { complete: true, items: [] })
  } finally {
    restore()
  }
})
