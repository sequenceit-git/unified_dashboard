const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const chain = (value) => {
  const p = Promise.resolve(value)
  for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p
  return p
}

function load({ products = [], listings = [] } = {}) {
  const seen = { productFilters: [], listingFilters: [], counted: [] }
  const restore = stubModules({
    '/models/Product': {
      find: (filter) => { seen.productFilters.push(filter); return chain(products) },
      countDocuments: async (filter) => { seen.counted.push(filter); return products.length },
      distinct: async (field, filter) => { seen.distinct = filter; return products.map((p) => p._id) },
    },
    '/models/Listing': { find: (filter) => { seen.listingFilters.push(filter); return chain(listings) }, distinct: async () => [] },
    '/models/Shop': { find: () => chain([]), findById: () => chain(null) },
    '/models/ResearchReport': { updateMany: () => ({ catch: () => {} }) },
    '../../services/marketplace': {},
    '../marketplace': {},
    '../manager': {},
    '/catalog/productImport': {},
    '/core/notify': { stockChangedOnShops: async () => {} },
  })
  return { service: freshRequire('marketplaces/temu/app/services/products.js'), seen, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('counts per Temu state for the status pills', async () => {
  const { service, restore } = load({
    products: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }, { _id: 'e' }, { _id: 'f' }],
    listings: [{ productId: 'a', status: 'live' }, { productId: 'b', status: 'live' }, { productId: 'c', status: 'error' }, { productId: 'd', status: 'out_of_stock' }, { productId: 'e', status: 'paused' }],
  })
  try {
    assert.deepEqual(await service.counts(admin), { all: 6, live: 2, unlisted: 1, out_of_stock: 1, paused: 1, ended: 0, error: 1, pending: 0 })
  } finally { restore() }
})

test("a sub-admin's counts only cover their own products", async () => {
  const { service, seen, restore } = load({ listings: [] })
  try {
    await service.counts({ user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: {}, body: {}, params: {} })
    assert.ok(seen.distinct._id, 'product count is scoped')
  } finally { restore() }
})

test('"Not on Temu" lists goods with no Temu listing', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'a', status: 'live' }] })
  try {
    await service.list({ ...admin, query: { listing: 'unlisted' } })
    assert.deepEqual(seen.productFilters.at(-1)._id, { $nin: ['a'] })
  } finally { restore() }
})

test('search by Temu goods id finds the listed goods', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'p9', externalListingId: '601234567890:1' }] })
  try {
    await service.list({ ...admin, query: { q: '601234567890' } })
    const or = seen.productFilters.at(-1).$or
    assert.ok(or.some((c) => c._id && c._id.$in.includes('p9')), JSON.stringify(or))
    assert.ok(seen.listingFilters.some((f) => f.externalListingId), 'looked up by item number')
  } finally { restore() }
})

test('counts cover only products the list can show, each product once', async () => {
  const { service, restore } = load({
    products: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }],
    listings: [{ productId: 'a', status: 'live' }, { productId: 'a', status: 'live' }, { productId: 'z', status: 'live' }, { productId: 'b', status: 'error' }],
  })
  try {
    assert.deepEqual(await service.counts(admin), { all: 3, live: 1, unlisted: 1, out_of_stock: 0, paused: 0, ended: 0, error: 1, pending: 0 })
  } finally { restore() }
})

test('Put on sale / Take off sale updates every SKU row of that goods', async () => {
  const saved = []
  const updates = []
  const restore = stubModules({
    '/models/Product': { findById: () => chain({ _id: 'p1', sku: 'A', stock: 3 }), find: () => chain([]), countDocuments: async () => 0, distinct: async () => [] },
    '/models/Listing': {
      findOne: async () => ({ _id: 'L1', productId: 'p1', shopId: 's1', externalListingId: '77:1', status: 'paused', save: async function save() { saved.push(this.status) }, toObject() { return { ...this } } }),
      find: () => chain([]),
      updateMany: async (filter, update) => { updates.push([filter, update]) },
      distinct: async () => [],
    },
    '/models/Shop': { findById: () => chain({ _id: 's1', marketplace: 'temu' }), find: () => chain([]) },
    '/models/ResearchReport': { updateMany: () => ({ catch: () => {} }) },
    '../../services/marketplace': {},
    '../marketplace': {},
    '../manager': { applyListingAction: async () => ({ status: 'live', marketplaceStatus: 'ON_SALE' }), rememberListing: async () => {} },
    '/catalog/productImport': {},
    '/core/notify': { stockChangedOnShops: async () => {}, listingStatusChanged: async () => {} },
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/products.js')
    await service.listingAction({ ...admin, params: { id: 'p1' }, body: { action: 'publish' } })
    assert.deepEqual(saved, ['live'])
    const [filter, update] = updates[0]
    assert.equal(filter.shopId, 's1')
    assert.equal(String(filter.externalListingId.$regex), '/^77:/')
    assert.equal(update.$set.status, 'live')
  } finally { restore() }
})

test('Inventory: low stock means some left, and listed=1 keeps it to goods on Temu', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'a', status: 'live' }] })
  try {
    await service.list({ ...admin, query: { stock: 'low', listed: '1' } })
    const f = seen.productFilters.at(-1)
    assert.deepEqual(f.stock, { $gt: 0 })
    assert.ok(f.$expr, 'stock at or under the low-stock alert')
    assert.deepEqual(f._id, { $in: ['a'] })
    await service.list({ ...admin, query: { stock: 'out' } })
    assert.equal(seen.productFilters.at(-1).stock, 0)
    assert.equal(seen.productFilters.at(-1)._id, undefined, 'without listed=1 nothing changes for the Goods page')
  } finally { restore() }
})
