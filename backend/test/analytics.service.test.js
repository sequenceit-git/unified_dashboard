const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

function load(groups) {
  const pipelines = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/Order': { aggregate: async (pipeline) => { pipelines.push(pipeline); return groups } },
    '/models/Product': {},
    '/models/Listing': {},
    '/models/Shop': { findOne: () => chain(null), find: () => chain([]) },
    '../../services/marketplace': {},
  })
  return { service: freshRequire('services/analytics/reports.js'), pipelines, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('marketplace totals sum orders per marketplace in the date range, without cancelled or refunded', async () => {
  const { service, pipelines, restore } = load([{ _id: 'ebay', revenue: 120.456, orders: 3 }, { _id: 'temu', revenue: 10, orders: 1 }])
  try {
    const out = await service.marketplaces({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', marketplace: 'all' } })
    assert.deepEqual(out, [{ marketplace: 'ebay', revenue: 120.46, orders: 3 }, { marketplace: 'temu', revenue: 10, orders: 1 }])
    const $match = pipelines[0][0].$match
    assert.deepEqual($match.status, { $nin: ['cancelled', 'refunded'] })
    assert.equal($match.placedAt.$gte.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal($match.placedAt.$lte.toISOString(), '2026-11-20T00:00:00.000Z')
    assert.equal($match.marketplace, undefined)
  } finally { restore() }
})

test('a marketplace filter narrows the totals', async () => {
  const { service, pipelines, restore } = load([])
  try {
    await service.marketplaces({ ...admin, query: { marketplace: 'tiktok' } })
    assert.equal(pipelines[0][0].$match.marketplace, 'tiktok_shop')
  } finally { restore() }
})
