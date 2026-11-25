const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../helpers/stub')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'overview-test-secret'
const { encrypt } = require('../../utils/recipientPii')

const NOW = new Date('2026-11-25T12:00:00Z')
const DAY = 86400000
const load = () => freshRequire('services/system/overview.js')

test('daily series: the 30-day window (31 calendar days, first one partial), every day present', () => {
  const { dailySeries } = load()
  const days = dailySeries([
    { _id: { day: '2026-11-25', marketplace: 'temu' }, revenue: 20, orders: 2 },
    { _id: { day: '2026-11-25', marketplace: 'ebay' }, revenue: 5, orders: 1 },
    { _id: { day: '2026-10-27', marketplace: 'temu' }, revenue: 7, orders: 1 },
  ], NOW)
  assert.equal(days.length, 31)
  assert.equal(days[0].date, '2026-10-26')
  assert.equal(days[30].date, '2026-11-25')
  assert.deepEqual(days[30].shops, { temu: { revenue: 20, orders: 2 }, ebay: { revenue: 5, orders: 1 } })
  assert.deepEqual(days[1].shops, { temu: { revenue: 7, orders: 1 } })
  assert.deepEqual(days[10].shops, {})
})

test('shop cards: every visible shop with safe auth fields and operational metrics', () => {
  const { shopCards } = load()
  const cards = shopCards(
    [
      {
        _id: 's1',
        name: 'My eBay',
        marketplace: 'ebay',
        status: 'connected',
        auth: { expiresAt: new Date(NOW.getTime() + 3600000), refreshTokenEnc: 'enc:v1:secret' },
        lastSyncAt: NOW,
      },
      {
        _id: 's2',
        name: 'My Temu',
        marketplace: 'temu',
        status: 'error',
        authError: 'token expired',
        auth: { expiresAt: new Date(NOW.getTime() + DAY) },
      },
    ],
    {
      sales: [{ _id: 's1', revenue: 100.456, orders: 4 }],
      prevSales: [{ _id: 's1', revenue: 50, orders: 2 }],
      toShip: [{ _id: 's2', n: 3 }],
      live: [{ _id: 's1', n: 9 }],
      listingErrors: [{ _id: 's2', n: 1 }],
      returns: [{ _id: 's2', n: 2 }],
      unread: [{ _id: 's1', threads: 3, messages: 5 }],
      stockByShop: [{ _id: 's1', outOfStock: 1, lowStock: 2 }],
      failingSyncs: [{ _id: 's2', n: 1 }],
    },
  )
  assert.deepEqual(
    cards.map((c) => [c.shopId, c.revenue, c.prevRevenue, c.orders, c.toShip, c.live, c.unread, c.outOfStock, c.lowStock, c.openReturns, c.listingErrors, c.status]),
    [
      ['s1', 100.46, 50, 4, 0, 9, 3, 1, 2, 0, 0, 'connected'],
      ['s2', 0, 0, 0, 3, 0, 0, 0, 0, 2, 1, 'error'],
    ],
  )
  assert.equal('auth' in cards[0], false)
  assert.equal(cards[0].canRefresh, true)
  assert.equal(cards[0].expiresAt, null)
  assert.equal(cards[0].hasInbox, true)
  assert.equal(cards[1].hasInbox, false)
  assert.equal(cards[1].failingSyncs, 1)
  assert.equal(cards[1].authError, 'token expired')
})

test('login problems: skips auto-refreshable access token expiry, still flags errors and manual expiry', () => {
  const { loginProblems } = load()
  const probs = loginProblems([
    { _id: 'a', name: 'A', marketplace: 'ebay', status: 'error', authError: 'revoked' },
    // Short-lived eBay access token with a refresh token auto-refreshes; must not alert.
    { _id: 'e1', name: 'eBay Auto', marketplace: 'ebay', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() + 3600000), refreshTokenEnc: 'enc:v1:rt' } },
    { _id: 'e2', name: 'eBay Expired Access', marketplace: 'ebay', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() - 3600000), refreshTokenEnc: 'enc:v1:rt' } },
    // Without refreshToken capability or without stored refresh token, still warns.
    { _id: 'b', name: 'B', marketplace: 'temu', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() + 2 * DAY) } },
    { _id: 'c', name: 'C', marketplace: 'temu', status: 'connected', auth: { expiresAt: new Date(NOW.getTime() + 10 * DAY) } },
    { _id: 'd', name: 'D', marketplace: 'temu', status: 'disconnected' },
  ], NOW)
  assert.deepEqual(probs.map((p) => [p.shopId, p.problem]), [['a', 'login stopped working'], ['b', 'login expires in 2 days']])
})

test('each part fails on its own; scoping filters reach every query; encrypted buyer names are decrypted', async () => {
  const seen = []
  const agg = (name) => async (pipeline) => {
    seen.push([name, pipeline[0].$match])
    if (name === 'orders' && pipeline.some((s) => s.$unwind)) throw new Error('top products broke')
    return []
  }
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const encryptedOrder = {
    _id: 'o1',
    externalOrderId: 'ORD-100',
    marketplace: 'temu',
    shopId: 's1',
    status: 'paid',
    placedAt: NOW,
    shipping: { shipBy: new Date(NOW.getTime() + DAY) },
    totals: { total: 42.5 },
    buyer: { name: encrypt('Jane Buyer') },
    items: [{ quantity: 2 }],
  }
  let findCalls = 0
  const restore = stubModules({
    '/models/Order': {
      aggregate: agg('orders'),
      countDocuments: async (q) => { seen.push(['orders.count', q]); return 2 },
      find: (q) => {
        seen.push(['orders.find', q])
        findCalls += 1
        return chain(findCalls === 1 ? [encryptedOrder] : [])
      },
    },
    '/models/Listing': {
      aggregate: agg('listings'),
      countDocuments: async (q) => { seen.push(['listings.count', q]); return 0 },
      find: (q) => { seen.push(['listings.find', q]); return chain([]) },
    },
    '/models/Shop': { find: (q) => { seen.push(['shops', q]); return chain([{ _id: 's1', name: 'A', marketplace: 'temu', status: 'connected' }]) } },
    '/models/SyncLog': {
      aggregate: async (pipeline) => {
        seen.push(['sync', pipeline[0].$match])
        return [{ _id: { shopId: 's1', type: 'orders' }, status: 'failed' }]
      },
    },
    '/models/Customer': { countDocuments: async () => 5 },
    '/models/Product': { countDocuments: async () => 0, find: () => chain([]) },
    '/models/Conversation': {
      aggregate: async (pipeline) => {
        seen.push(['conv', pipeline[0].$match])
        return [{ _id: null, messages: 3 }]
      },
      find: (q) => { seen.push(['conv.find', q]); return chain([]) },
    },
  })
  try {
    const { overviewExtras } = load()
    const res = await overviewExtras({
      orderFilter: { shopId: { $in: ['s1'] } },
      listingFilter: { shopId: { $in: ['s1'] } },
      conversationFilter: { shopId: { $in: ['s1'] } },
      shopScope: { _id: { $in: ['s1'] } },
      productFilter: {},
      now: NOW,
    })
    assert.match(res.errors.topProducts, /top products broke/)
    assert.deepEqual(res.topProducts, null)
    assert.equal(res.attention.late, 2)
    assert.equal(res.attention.syncFailed24h, 1)
    assert.equal(res.attention.unreadMessages, 3)
    assert.equal(res.toShipNext[0].buyer, 'Jane Buyer')
    assert.equal(res.toShipNext[0].itemsCount, 2)
    assert.equal('newBuyers30' in res, false, 'no "new buyers": the dashboard only knows when a buyer was first synced')
    assert.deepEqual(res.previous, { revenue: 0, soldOrders: 0, orders: 2, avgOrder: 0 }, 'previous orders count every status, like orders30')
    assert.equal(res.byShop.length, 1)
    for (const [name, q] of seen.filter(([n]) => n.startsWith('orders'))) assert.deepEqual(q.shopId, { $in: ['s1'] }, `${name} keeps the shop scope`)
    assert.deepEqual(seen.find(([n]) => n === 'sync')[1].shopId, { $in: ['s1'] })
    assert.deepEqual(seen.find(([n]) => n === 'conv')[1].shopId, { $in: ['s1'] })
  } finally { restore() }
})

test('when the shop list fails, failed syncs are unknown, not 0', async () => {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { aggregate: async () => [], countDocuments: async () => 0, find: () => chain([]) },
    '/models/Listing': { aggregate: async () => [], countDocuments: async () => 0, find: () => chain([]) },
    '/models/Shop': { find: () => { throw new Error('shops down') } },
    '/models/SyncLog': { aggregate: async () => [] },
    '/models/Customer': { countDocuments: async () => 0 },
    '/models/Product': { countDocuments: async () => 0, find: () => chain([]) },
    '/models/Conversation': { aggregate: async () => [], find: () => chain([]) },
  })
  try {
    const res = await load().overviewExtras({ now: NOW })
    assert.equal(res.attention.syncFailed24h, null)
    assert.match(res.errors.shops, /shops down/)
  } finally { restore() }
})
