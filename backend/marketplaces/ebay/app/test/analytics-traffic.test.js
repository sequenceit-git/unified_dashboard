const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
const admin = { user: { id: 'u1', role: 'super_admin' }, query: { from: '2026-11-17', to: '2026-11-23' }, body: {}, params: {} }

function load({ dailyTraffic, shop = { _id: 's1', marketplace: 'ebay', status: 'connected' }, pipelines = [], shopFilters = [] }) {
  const restore = stubModules({
    '/models/Order': { schema: { path: () => true }, aggregate: async (pl) => { pipelines.push(pl); return [] } },
    '/models/Product': {},
    '/models/Listing': {},
    '/models/Shop': { findOne: (f) => { shopFilters.push(f); return chain(shop) }, find: () => chain([]) },
    '../manager': { withShopToken: async (s, fn) => fn('tok') },
    '../../sections/analytics': { dailyTraffic },
  })
  return { service: freshRequire('marketplaces/ebay/app/services/analytics.js'), restore }
}

test("traffic comes from eBay's daily traffic report for the asked days", async () => {
  const seen = []
  const { service, restore } = load({ dailyTraffic: async (token, from, to) => { seen.push([token, from, to]); return { latestDate: '2026-11-23', days: [] } } })
  try {
    assert.deepEqual(await service.traffic(admin), { latestDate: '2026-11-23', days: [] })
    assert.deepEqual(seen, [['tok', '2026-11-17', '2026-11-23']])
  } finally { restore() }
})

test('a refused traffic report says to reconnect eBay', async () => {
  const { service, restore } = load({ dailyTraffic: async () => { throw Object.assign(new Error('Insufficient permissions'), { status: 403 }) } })
  try {
    await assert.rejects(service.traffic(admin), (e) => e.status === 502 && /Reconnect eBay/.test(e.body.error))
  } finally { restore() }
})

test('a sub-admin only reaches their own eBay shop', async () => {
  const shopFilters = []
  const { service, restore } = load({ shopFilters, shop: null, dailyTraffic: async () => ({}) })
  try {
    await assert.rejects(service.traffic({ ...admin, user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s9'] }), (e) => e.status === 404)
    assert.deepEqual(shopFilters[0]._id, { $in: ['s9'] })
  } finally { restore() }
})

test('revenue by day is grouped in the viewer time zone and a plain "to" day counts in full', async () => {
  const pipelines = []
  const { service, restore } = load({ pipelines, dailyTraffic: async () => ({}) })
  try {
    await service.revenue({ ...admin, query: { from: '2026-11-17', to: '2026-11-23', tz: 'America/New_York' } })
    assert.equal(pipelines[0][1].$group._id.$dateToString.timezone, 'America/New_York')
    assert.equal(pipelines[0][0].$match.placedAt.$lte.toISOString(), '2026-11-24T04:59:59.999Z', 'the end of Nov 23 in New York')
    await service.revenue({ ...admin, query: { ...admin.query, tz: 'bad zone!' } })
    assert.equal(pipelines[1][1].$group._id.$dateToString.timezone, 'UTC')
  } finally { restore() }
})

test("plain days with a time zone are that zone's whole days (eBay US: Pacific)", async () => {
  const pipelines = []
  const { service, restore } = load({ pipelines, dailyTraffic: async () => ({}) })
  try {
    await service.revenue({ ...admin, query: { from: '2026-11-17', to: '2026-11-23', tz: 'America/Los_Angeles' } })
    const { $gte, $lte } = pipelines[0][0].$match.placedAt
    assert.equal($gte.toISOString(), '2026-11-17T08:00:00.000Z')
    assert.equal($lte.toISOString(), '2026-11-24T07:59:59.999Z')
    await service.summary({ ...admin, query: { from: '2026-06-01', to: '2026-06-01', tz: 'America/Los_Angeles' } })
    const s = pipelines.find((pl) => pl[0].$match.placedAt.$gte.toISOString() === '2026-06-01T07:00:00.000Z')
    assert.ok(s, 'summary uses the zone too (summer time)')
  } finally { restore() }
})
