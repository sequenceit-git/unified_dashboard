const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }
const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p; return p }

test('eBay order counts per state, late ones and returns waiting', async () => {
  const filters = []
  const NOW = new Date('2026-11-25T12:00:00Z')
  const restore = stubModules({
    '/models/Shop': {},
    '../manager': {},
    '/models/Order': {
      schema: { path: () => true },
      aggregate: async (pipeline) => { filters.push(pipeline[0].$match); return [{ _id: 'paid', n: 4 }, { _id: 'processing', n: 2 }, { _id: 'shipped', n: 10 }, { _id: 'delivered', n: 30 }, { _id: 'cancelled', n: 1 }, { _id: 'pending', n: 1 }, { _id: 'returned', n: 2 }, { _id: 'refunded', n: 1 }] },
      countDocuments: async (filter) => { filters.push(filter); return filter['shipping.shipBy'] ? 1 : 2 },
    },
  })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/orders.js')
    const out = await service.counts(admin, { now: NOW })
    assert.deepEqual(out, { all: 51, toShip: 6, late: 1, unpaid: 1, shipped: 10, delivered: 30, cancelled: 1, returns: 3, returnsRequested: 2 })
    assert.ok(filters.every((f) => f.marketplace === 'ebay'), 'only eBay orders')
    const late = filters.find((f) => f['shipping.shipBy'])
    assert.deepEqual(late.status, { $in: ['paid', 'processing'] })
    assert.equal(late['shipping.shipBy'].$lt.toISOString(), NOW.toISOString())
    assert.ok(filters.some((f) => f['returns.status'] === 'requested'))
  } finally { restore() }
})

test('the eBay order list is always eBay orders; statuses can be a list; late filter', async () => {
  const seen = []
  const restore = stubModules({
    '/models/Shop': {},
    '../manager': {},
    '/models/Order': { schema: { path: () => true }, find: (f) => { seen.push(f); return chain([]) }, countDocuments: async (f) => { seen.push(f); return 0 } },
  })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/orders.js')
    await service.list({ ...admin, query: { status: 'paid,processing' } })
    assert.ok(seen.every((f) => f.marketplace === 'ebay'), 'never another shop')
    assert.deepEqual(seen[0].status, { $in: ['paid', 'processing'] })
    await service.list({ ...admin, query: { late: '1' } })
    assert.deepEqual(seen.at(-1).status, { $in: ['paid', 'processing'] })
    assert.ok(seen.at(-1)['shipping.shipBy'].$lt instanceof Date)
  } finally { restore() }
})
