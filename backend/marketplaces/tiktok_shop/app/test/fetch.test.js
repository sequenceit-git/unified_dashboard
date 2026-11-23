const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

test('fetchShopListings asks TikTok Shop for up to 2000 listings', async () => {
  const calls = []
  const adapter = {
    service: { getInventory: async (token, o) => { calls.push(['getInventory', o.limit]); return { inventoryItems: [{ externalListingId: '1', sku: 'S' }] } } },
    hooks: { fetchListings: async () => { calls.push(['hook']); return { complete: true, items: [] } } },
    capabilities: {},
  }
  const models = Object.fromEntries(['Order', 'Customer', 'SyncLog', 'Shop', 'Product', 'Listing', 'InventoryLog', 'IgnoredListing', 'Conversation', 'Message'].map((m) => [`/models/${m}`, modelStub()]))
  const restore = stubModules({ ...models, '..': adapter })
  try {
    const manager = freshRequire('marketplaces/tiktok_shop/app/manager.js')
    const res = await manager.fetchShopListings({ marketplace: 'tiktok_shop' }, 'tok')
    assert.deepEqual(calls, [['getInventory', 2000]])
    assert.equal(res.items[0].listingStatus, 'live')
  } finally {
    restore()
  }
})
