const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

function load(groups) {
  const pipelines = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { aggregate: async (pipeline) => { pipelines.push(pipeline); return groups } },
    '/models/Product': {},
    '/models/Listing': {},
    '/models/Shop': { findOne: () => chain(null), find: () => chain([]) },
    '../../services/marketplace': {},
    '../manager': {},
  })
  return { service: freshRequire('marketplaces/temu/app/services/analytics.js'), pipelines, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('Temu totals count only Temu orders in the date range, without cancelled or refunded', async () => {
  const { service, pipelines, restore } = load([{ _id: 'temu', revenue: 120.456, orders: 3 }])
  try {
    const out = await service.marketplaces({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', marketplace: 'ebay' } })
    assert.deepEqual(out, [{ marketplace: 'temu', revenue: 120.46, orders: 3 }])
    const $match = pipelines[0][0].$match
    assert.equal($match.marketplace, 'temu', 'whatever the client sends, only Temu rows')
    assert.deepEqual($match.status, { $nin: ['cancelled', 'refunded'] })
    assert.equal($match.placedAt.$gte.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal($match.placedAt.$lte.toISOString(), '2026-11-20T00:00:00.000Z')
  } finally { restore() }
})

test('top goods carry their Temu goods ids, within the sub-admin shops', async () => {
  const filters = []
  const listings = [{ productId: 'p1', externalListingId: '77:1' }, { productId: 'p1', externalListingId: '77:2' }, { productId: 'p1', externalListingId: '88:5' }]
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, aggregate: async () => [{ _id: 'p1', sku: 'A', title: 'Case', qty: 2, revenue: 20 }] },
    '/models/Product': {},
    '/models/Listing': { find: (filter) => { filters.push(filter); return chain(listings) } },
    '/models/Shop': { findOne: () => chain(null), find: () => chain([]) },
    '../../services/marketplace': {},
    '../manager': {},
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/analytics.js')
    const out = await service.products({ ...admin, query: { from: '2026-11-01', to: '2026-11-20' } })
    assert.deepEqual(out[0].goodsIds, ['77', '88'])
    await service.products({ user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: { from: '2026-11-01', to: '2026-11-20' }, body: {}, params: {} })
    const f = filters.at(-1)
    assert.equal(f.marketplace, 'temu')
    assert.deepEqual(f.shopId, { $in: ['s1'] })
  } finally { restore() }
})

test('revenue by day is grouped in the viewer time zone; a bad zone falls back to UTC', async () => {
  const { service, pipelines, restore } = load([{ _id: '2026-11-18', revenue: 10, orders: 1 }])
  try {
    await service.revenue({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', tz: 'Asia/Dhaka' } })
    assert.equal(pipelines[0][1].$group._id.$dateToString.timezone, 'Asia/Dhaka')
    await service.revenue({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', tz: 'Not/AZone' } })
    assert.equal(pipelines[1][1].$group._id.$dateToString.timezone, 'UTC')
  } finally { restore() }
})

test('order lines without a product are left out of the goods id lookup', async () => {
  const filters = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, aggregate: async () => [{ _id: null, sku: 'X', title: 'Loose', qty: 1, revenue: 5 }, { _id: 'p1', sku: 'A', title: 'Case', qty: 2, revenue: 20 }] },
    '/models/Product': {},
    '/models/Listing': { find: (filter) => { filters.push(filter); return chain([]) } },
    '/models/Shop': { findOne: () => chain(null), find: () => chain([]) },
    '../../services/marketplace': {},
    '../manager': {},
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/analytics.js')
    const out = await service.products({ ...admin, query: { from: '2026-11-01', to: '2026-11-20' } })
    assert.deepEqual(filters[0].productId.$in, ['p1'])
    assert.deepEqual(out[0].goodsIds, [])
  } finally { restore() }
})
