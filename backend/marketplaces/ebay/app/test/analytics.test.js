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
  return { service: freshRequire('marketplaces/ebay/app/services/analytics.js'), pipelines, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('eBay totals count only eBay orders in the date range, without cancelled or refunded', async () => {
  const { service, pipelines, restore } = load([{ _id: 'ebay', revenue: 120.456, orders: 3 }])
  try {
    const out = await service.marketplaces({ ...admin, query: { from: '2026-11-01', to: '2026-11-20', marketplace: 'temu' } })
    assert.deepEqual(out, [{ marketplace: 'ebay', revenue: 120.46, orders: 3 }])
    const $match = pipelines[0][0].$match
    assert.equal($match.marketplace, 'ebay', 'whatever the client sends, only eBay rows')
    assert.deepEqual($match.status, { $nin: ['cancelled', 'refunded'] })
    assert.equal($match.placedAt.$gte.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal($match.placedAt.$lte.toISOString(), '2026-11-20T23:59:59.999Z', 'a plain "to" day counts in full')
  } finally { restore() }
})
