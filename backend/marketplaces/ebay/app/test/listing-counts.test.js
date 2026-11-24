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
      distinct: async () => [],
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
  return { service: freshRequire('marketplaces/ebay/app/services/products.js'), seen, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('counts per eBay listing state for the status pills', async () => {
  const { service, restore } = load({
    products: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }, { _id: 'e' }, { _id: 'f' }],
    listings: [{ productId: 'a', status: 'live' }, { productId: 'b', status: 'live' }, { productId: 'c', status: 'error' }, { productId: 'd', status: 'out_of_stock' }, { productId: 'e', status: 'paused' }],
  })
  try {
    assert.deepEqual(await service.counts(admin), { all: 6, live: 2, unlisted: 1, out_of_stock: 1, ended: 1, error: 1, pending: 0 })
  } finally { restore() }
})

test("a sub-admin's counts only cover their own products", async () => {
  const { service, seen, restore } = load({ listings: [] })
  try {
    await service.counts({ user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: {}, body: {}, params: {} })
    assert.ok(seen.counted[0]._id, 'product count is scoped')
  } finally { restore() }
})

test('"Not listed" lists products with no eBay listing; "Ended" includes unsold', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'a', status: 'live' }] })
  try {
    await service.list({ ...admin, query: { listing: 'unlisted' } })
    assert.deepEqual(seen.productFilters.at(-1)._id, { $nin: ['a'] })
    await service.list({ ...admin, query: { listing: 'closed' } })
    assert.ok(seen.listingFilters.some((f) => JSON.stringify(f.status) === JSON.stringify({ $in: ['ended', 'paused'] })))
  } finally { restore() }
})

test('search by eBay item number finds the listed product', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'p9', externalListingId: '123456789012' }] })
  try {
    await service.list({ ...admin, query: { q: '123456789012' } })
    const or = seen.productFilters.at(-1).$or
    assert.ok(or.some((c) => c._id && c._id.$in.includes('p9')), JSON.stringify(or))
    assert.ok(seen.listingFilters.some((f) => f.externalListingId), 'looked up by item number')
  } finally { restore() }
})
