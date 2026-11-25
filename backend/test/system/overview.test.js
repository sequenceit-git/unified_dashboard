const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../helpers/stub')

const NOW = new Date('2026-11-25T12:00:00Z')
const load = () => freshRequire('services/system/overview.js')

test('daily series: 30 days, every day present, revenue and orders per shop', () => {
  const { dailySeries } = load()
  const days = dailySeries([
    { _id: { day: '2026-11-25', marketplace: 'temu' }, revenue: 20, orders: 2 },
    { _id: { day: '2026-11-25', marketplace: 'ebay' }, revenue: 5, orders: 1 },
    { _id: { day: '2026-10-27', marketplace: 'temu' }, revenue: 7, orders: 1 },
  ], NOW, 30)
  assert.equal(days.length, 30)
  assert.equal(days[0].date, '2026-10-27')
  assert.equal(days[29].date, '2026-11-25')
  assert.deepEqual(days[29].shops, { temu: { revenue: 20, orders: 2 }, ebay: { revenue: 5, orders: 1 } })
  assert.deepEqual(days[0].shops, { temu: { revenue: 7, orders: 1 } })
  assert.deepEqual(days[10].shops, {})
})

test('shop cards: every visible shop, with its own numbers or zeros', () => {
  const { shopCards } = load()
  const cards = shopCards(
    [{ _id: 's1', name: 'My eBay', marketplace: 'ebay', status: 'connected', lastSyncAt: NOW }, { _id: 's2', name: 'My Temu', marketplace: 'temu', status: 'error', authError: 'token expired' }],
    { sales: [{ _id: 's1', revenue: 100.456, orders: 4 }], toShip: [{ _id: 's2', n: 3 }], live: [{ _id: 's1', n: 9 }] },
  )
  assert.deepEqual(cards.map((c) => [c.shopId, c.revenue, c.orders, c.toShip, c.live, c.status]), [['s1', 100.46, 4, 0, 9, 'connected'], ['s2', 0, 0, 3, 0, 'error']])
  assert.equal(cards[1].authError, 'token expired')
})

test('login problems: broken logins and logins expiring within 3 days', () => {
  const { loginProblems } = load()
  const day = 86400000
  const probs = loginProblems([
    { _id: 'a', name: 'A', marketplace: 'ebay', status: 'error', authError: 'revoked' },
    { _id: 'b', name: 'B', marketplace: 'temu', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() + 2 * day) } },
    { _id: 'c', name: 'C', marketplace: 'temu', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() + 10 * day) } },
    { _id: 'd', name: 'D', marketplace: 'temu', status: 'disconnected' },
  ], NOW)
  assert.deepEqual(probs.map((p) => [p.shopId, p.problem]), [['a', 'login stopped working'], ['b', 'login expires in 2 days']])
})

test('each part fails on its own; scoping filters reach every query', async () => {
  const seen = []
  const agg = (name) => async (pipeline) => {
    seen.push([name, pipeline[0].$match])
    if (name === 'orders' && pipeline.some((s) => s.$unwind)) throw new Error('top products broke')
    return []
  }
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { aggregate: agg('orders'), countDocuments: async (q) => { seen.push(['orders.count', q]); return 2 }, find: (q) => { seen.push(['orders.find', q]); return chain([]) } },
    '/models/Listing': { aggregate: agg('listings') },
    '/models/Shop': { find: (q) => { seen.push(['shops', q]); return chain([{ _id: 's1', name: 'A', marketplace: 'temu', status: 'connected' }]) } },
    '/models/SyncLog': { countDocuments: async (q) => { seen.push(['sync', q]); return 1 } },
    '/models/Customer': { countDocuments: async () => 5 },
    '/models/Product': { countDocuments: async () => 0, find: () => chain([]) },
  })
  try {
    const { overviewExtras } = load()
    const res = await overviewExtras({ orderFilter: { shopId: { $in: ['s1'] } }, listingFilter: { shopId: { $in: ['s1'] } }, shopScope: { _id: { $in: ['s1'] } }, buyerFilter: {}, productFilter: {}, now: NOW })
    assert.match(res.errors.topProducts, /top products broke/)
    assert.deepEqual(res.topProducts, null)
    assert.equal(res.attention.late, 2)
    assert.equal(res.attention.syncFailed24h, 1)
    assert.equal(res.byShop.length, 1)
    for (const [name, q] of seen.filter(([n]) => n.startsWith('orders'))) assert.deepEqual(q.shopId, { $in: ['s1'] }, `${name} keeps the shop scope`)
    assert.deepEqual(seen.find(([n]) => n === 'sync')[1].shopId, { $in: ['s1'] })
  } finally { restore() }
})
