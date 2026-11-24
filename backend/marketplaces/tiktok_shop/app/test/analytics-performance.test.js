const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const INTERVAL = {
  start_date: '2026-11-20',
  sales: {
    gmv: { overall: { amount: '100', currency: 'USD' }, breakdowns: [{ type: 'VIDEO', gmv: { amount: '60' } }, { type: 'LIVE', gmv: { amount: '10' } }, { type: 'PRODUCT_CARD', gmv: { amount: '30' } }] },
    orders_count: 4, items_sold: 5, refunds: { amount: '8', currency: 'USD' }, avg_customers_count: 3,
  },
  traffic: { avg_page_views: 200, avg_visitors: 120, avg_conversation_rate: '0.025' },
}

test('a TikTok day maps to sales, channels and traffic', () => {
  const { dayPerformance } = freshRequire('marketplaces/tiktok_shop/hooks.js')
  assert.deepEqual(dayPerformance(INTERVAL), {
    date: '2026-11-20', gmv: 100, orders: 4, items: 5, refunds: 8, customers: 3,
    pageViews: 200, visitors: 120, conversion: 0.025, channels: { video: 60, live: 10, productCard: 30 },
  })
  const bare = dayPerformance({ start_date: '2026-11-21', sales: { gmv: { overall: { amount: '5' } }, orders_count: 1 } })
  assert.equal(bare.visitors, null)
  assert.equal(bare.conversion, null)
  assert.equal(bare.channels, null)
})

function load({ performance, shop = { _id: 's1', marketplace: 'tiktok_shop', status: 'connected' }, calls = [] }) {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, aggregate: async () => [{ _id: '2026-11-20', revenue: 12.5, orders: 2, items: 3 }] },
    '/models/Product': {},
    '/models/Listing': {},
    '/models/Shop': { findOne: () => chain(shop), find: () => chain([]) },
    '../manager': { withShopToken: async (s, fn) => fn('tok') },
    '../..': { hooks: { analytics: { dailyPerformance: async (...args) => { calls.push(args); return performance() } } } },
  })
  return { service: freshRequire('marketplaces/tiktok_shop/app/services/analytics.js'), restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: { from: '2026-11-01', to: '2026-11-20' }, body: {}, params: {} }

test("performance comes from TikTok's analytics with its latest date", async () => {
  const day = { date: '2026-11-20', gmv: 100 }
  const { service, restore } = load({ performance: async () => ({ latestDate: '2026-11-23', days: [day] }) })
  try {
    assert.deepEqual(await service.performance(admin), { source: 'tiktok', latestDate: '2026-11-23', days: [day] })
  } finally { restore() }
})

test("when TikTok refuses, performance falls back to the dashboard's orders without traffic", async () => {
  const { service, restore } = load({ performance: async () => { throw new Error('scope not granted') } })
  try {
    const out = await service.performance(admin)
    assert.equal(out.source, 'orders')
    assert.equal(out.latestDate, null)
    assert.deepEqual(out.days, [{ date: '2026-11-20', gmv: 12.5, orders: 2, items: 3, refunds: null, customers: null, pageViews: null, visitors: null, conversion: null, channels: null }])
  } finally { restore() }
})

test("a sub-admin without the TikTok shop gets orders only, and TikTok isn't asked", async () => {
  const calls = []
  const { service, restore } = load({ calls, performance: async () => ({ latestDate: null, days: [] }) })
  try {
    const out = await service.performance({ user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['other'], query: admin.query, body: {}, params: {} })
    assert.equal(out.source, 'orders')
    assert.equal(calls.length, 0)
  } finally { restore() }
})

test('plain calendar days count in full: the "to" day is included', async () => {
  const pipelines = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, aggregate: async (pl) => { pipelines.push(pl); return [] } },
    '/models/Product': {},
    '/models/Listing': {},
    '/models/Shop': { findOne: () => chain(null), find: () => chain([]) },
    '../manager': {},
    '../..': { hooks: { analytics: {} } },
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/analytics.js')
    await service.performance({ ...admin, query: { from: '2026-11-17', to: '2026-11-23' } })
    assert.equal(pipelines[0][0].$match.placedAt.$lte.toISOString(), '2026-11-23T23:59:59.999Z')
  } finally { restore() }
})
