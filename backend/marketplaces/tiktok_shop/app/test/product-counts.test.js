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
  return { service: freshRequire('marketplaces/tiktok_shop/app/services/products.js'), seen, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('counts per TikTok listing state for the status pills', async () => {
  const { service, restore } = load({
    products: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }, { _id: 'e' }, { _id: 'f' }],
    listings: [{ productId: 'a', status: 'live' }, { productId: 'b', status: 'live' }, { productId: 'c', status: 'error' }, { productId: 'd', status: 'out_of_stock' }, { productId: 'e', status: 'paused' }],
  })
  try {
    assert.deepEqual(await service.counts(admin), { all: 6, live: 2, unlisted: 1, out_of_stock: 1, ended: 1, error: 1, pending: 0 })
  } finally { restore() }
})

test('closed lists ended and paused; a TikTok product id finds its product', async () => {
  const { service, seen, restore } = load({ listings: [{ productId: 'a', status: 'ended' }] })
  try {
    await service.list({ ...admin, query: { listing: 'closed' } })
    assert.ok(seen.listingFilters.some((f) => JSON.stringify(f.status) === JSON.stringify({ $in: ['ended', 'paused'] })), 'closed = ended and paused')
    await service.list({ ...admin, query: { q: '1729384756102938475' } })
    assert.ok(seen.listingFilters.some((f) => f.marketplace === 'tiktok_shop' && f.externalListingId?.$regex))
  } finally { restore() }
})
