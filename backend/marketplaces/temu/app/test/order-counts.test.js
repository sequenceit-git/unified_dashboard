const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('order counts per Temu state, with late ones (to ship and past the ship-by date)', async () => {
  const filters = []
  const NOW = new Date('2026-11-25T12:00:00Z')
  const restore = stubModules({
    '/models/Order': {
      schema: { path: () => true },
      aggregate: async (pipeline) => { filters.push(pipeline[0].$match); return [{ _id: 'paid', n: 7 }, { _id: 'processing', n: 2 }, { _id: 'shipped', n: 20 }, { _id: 'delivered', n: 90 }, { _id: 'cancelled', n: 5 }, { _id: 'pending', n: 2 }, { _id: 'returned', n: 1 }, { _id: 'refunded', n: 3 }] },
      countDocuments: async (filter) => { filters.push(filter); return 3 },
    },
    '/models/Shop': {},
    '../manager': {},
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    const out = await service.counts(admin, { now: NOW })
    assert.deepEqual(out, { all: 130, toShip: 9, late: 3, shipped: 20, delivered: 90, cancelled: 5, unpaid: 2, returns: 4 })
    const late = filters.find((f) => f['shipping.shipBy'])
    assert.deepEqual(late.status, { $in: ['paid', 'processing'] })
    assert.equal(late.marketplace, 'temu')
    assert.equal(late['shipping.shipBy'].$lt.toISOString(), NOW.toISOString())
  } finally { restore() }
})

test('the list can show only late orders', async () => {
  const seen = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, find: (f) => { seen.push(f); return chain([]) }, countDocuments: async (f) => { seen.push(f); return 0 } },
    '/models/Shop': {},
    '../manager': {},
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    await service.list({ ...admin, query: { late: '1' } })
    assert.ok(seen.some((f) => f.status?.$in?.includes('paid') && f['shipping.shipBy']?.$lt))
  } finally { restore() }
})

test('the Temu order list is always Temu orders, and statuses can be a list', async () => {
  const seen = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, find: (f) => { seen.push(f); return chain([]) }, countDocuments: async (f) => { seen.push(f); return 0 } },
    '/models/Shop': {},
    '../manager': {},
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    await service.list({ ...admin, query: { status: 'paid,processing' } })
    assert.ok(seen.every((f) => f.marketplace === 'temu'), 'never another shop')
    assert.deepEqual(seen[0].status, { $in: ['paid', 'processing'] })
    await service.list({ ...admin, query: { late: '1' } })
    assert.deepEqual(seen.at(-1).status, { $in: ['paid', 'processing'] })
  } finally { restore() }
})
