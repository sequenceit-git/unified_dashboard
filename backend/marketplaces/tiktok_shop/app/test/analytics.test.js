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
  return { service: freshRequire('marketplaces/tiktok_shop/app/services/analytics.js'), pipelines, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('order totals count only TikTok Shop orders in the date range, without cancelled or refunded', async () => {
  const { service, pipelines, restore } = load([{ _id: 'tiktok_shop', revenue: 120.456, orders: 3 }])
  try {
    const out = await service.marketplaces({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', marketplace: 'temu' } })
    assert.deepEqual(out, [{ marketplace: 'tiktok_shop', revenue: 120.46, orders: 3 }])
    const $match = pipelines[0][0].$match
    assert.equal($match.marketplace, 'tiktok_shop', 'whatever the client sends, only TikTok Shop rows')
    assert.deepEqual($match.status, { $nin: ['cancelled', 'refunded'] })
    assert.equal($match.placedAt.$gte.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal($match.placedAt.$lte.toISOString(), '2026-11-20T00:00:00.000Z')
  } finally { restore() }
})

/** TikTok Shop's own analytics API (adapter hooks.analytics), stubbed. */
function loadNative({ intervals = [], products = [] } = {}) {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const shop = { _id: 's1', marketplace: 'tiktok_shop', status: 'connected' }
  const adapter = { hooks: { analytics: { salesIntervals: async () => intervals, productPerformance: async () => products } } }
  const restore = stubModules({
    '/models/Order': { aggregate: async () => [{ _id: null, profit: 0 }] },
    '/models/Product': { find: () => chain([{ _id: 'p1', sku: 'SKU1', title: 'Mug' }]) },
    '/models/Listing': { find: () => chain([{ externalListingId: '777:1', productId: 'p1' }]) },
    '/models/Shop': { findOne: () => chain(shop), find: () => chain([]) },
    '../manager': { withShopToken: async (s, fn) => fn('tok') },
    '../..': adapter,
  })
  return { service: freshRequire('marketplaces/tiktok_shop/app/services/analytics.js'), restore }
}

test("TikTok Shop's totals come from its own analytics API", async () => {
  const { service, restore } = loadNative({ intervals: [{ date: '2026-11-01', revenue: 10.5, orders: 2, items: 3 }, { date: '2026-11-02', revenue: 4, orders: 1, items: 1 }] })
  try {
    assert.deepEqual(await service.marketplaces({ ...admin, query: {} }), [{ marketplace: 'tiktok_shop', revenue: 14.5, orders: 3 }])
    assert.deepEqual(await service.revenue({ ...admin, query: {} }), [{ date: '2026-11-01', revenue: 10.5, orders: 2, items: 3 }, { date: '2026-11-02', revenue: 4, orders: 1, items: 1 }])
  } finally { restore() }
})

test('native product performance is joined to catalog products by listing product key', async () => {
  const { service, restore } = loadNative({ products: [{ id: '777', title: 'TT title', qty: 5, revenue: 50 }] })
  try {
    assert.deepEqual(await service.products({ ...admin, query: {} }), [{ productId: 'p1', sku: 'SKU1', title: 'Mug', qty: 5, revenue: 50 }])
  } finally { restore() }
})
