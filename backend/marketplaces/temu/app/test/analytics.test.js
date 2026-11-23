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
