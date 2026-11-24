const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const NOW = new Date('2026-11-24T10:00:00Z')
const traffic = (order) => ({
  header: { dimensionKeys: [{ key: 'LISTING_ID' }], metrics: order.map((key) => ({ key })) },
  records: [
    { dimensionValues: [{ value: '111' }], metricValues: order.map((k) => ({ value: { LISTING_IMPRESSION_TOTAL: 1000, LISTING_VIEWS_TOTAL: 50, CLICK_THROUGH_RATE: 2.5, SALES_CONVERSION_RATE: 4, TRANSACTION: 2 }[k] })) },
    { dimensionValues: [{ value: '222' }], metricValues: order.map((k) => ({ value: { LISTING_IMPRESSION_TOTAL: 300, LISTING_VIEWS_TOTAL: 90, CLICK_THROUGH_RATE: 1.5, SALES_CONVERSION_RATE: 0, TRANSACTION: 0 }[k] })) },
  ],
})
const ORDER = ['LISTING_IMPRESSION_TOTAL', 'LISTING_VIEWS_TOTAL', 'CLICK_THROUGH_RATE', 'SALES_CONVERSION_RATE', 'TRANSACTION']
const STANDARDS = { standardsProfiles: [
  { program: 'PROGRAM_US', cycle: { cycleType: 'CURRENT' }, standardsLevel: 'TOP_RATED', metrics: [{ metricKey: 'DEFECTIVE_TRANSACTION_RATE', value: { value: '0.12' } }, { metricKey: 'SHIPPING_MISS_RATE', value: '1.1' }, { metricKey: 'CLAIMS_SAF_RATE', value: { value: '0' } }] },
  { program: 'PROGRAM_US', cycle: { cycleType: 'PROJECTED' }, standardsLevel: 'ABOVE_STANDARD', metrics: [] },
] }
const SERVICE = { dimensionMetrics: [{ dimension: { name: 'Clothing' }, metrics: [{ metricKey: 'RATE', value: '0.8', benchmark: { rating: 'HIGH', metadata: { average: '0.3' } } }] }] }

function load(get) {
  const urls = []
  const restore = stubModules({
    './helpers': { scopeAware: require('../sections/helpers').scopeAware, ebayGet: async (token, url) => { urls.push(url); return get(url) }, ebayApiz: () => 'https://apiz.ebay.com' },
    'services/marketplace/sectionKit': { ...require('../../../services/marketplace/sectionKit'), listingTitles: async () => new Map([['111', { title: 'Blue jeans', sku: 'J1' }]]) },
  })
  const analytics = freshRequire('marketplaces/ebay/sections/analytics.js')
  return { analytics, urls, restore }
}
const fixtures = (order = ORDER) => (url) => (url.includes('traffic_report') ? traffic(order) : url.includes('seller_standards') ? STANDARDS : SERVICE)

test('traffic report asks for the last 30 days per listing', async () => {
  const { analytics, urls, restore } = load(fixtures())
  try {
    await analytics('tok', {}, { now: NOW })
    assert.ok(urls.includes('/sell/analytics/v1/traffic_report?dimension=LISTING&metric=LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE,TRANSACTION&filter=marketplace_ids:%7BEBAY_US%7D,date_range:%5B20261025..20261123%5D'), urls.join('\n'))
  } finally { restore() }
})

test('traffic rows map metrics by the header order', async () => {
  const { analytics, restore } = load(fixtures([...ORDER].reverse()))
  try {
    const data = await analytics('tok', {}, { now: NOW })
    const t = data.tables.find((x) => x.id === 'traffic')
    assert.equal(t.tab, 'Listing traffic')
    assert.deepEqual(t.rows.map((r) => [r.listingId, r.impressions, r.views, r.ctr, r.conversion, r.sold]), [['222', 300, 90, 1.5, 0, 0], ['111', 1000, 50, 2.5, 4, 2]])
    const tiles = Object.fromEntries(data.summary.map((s) => [s.label, s.value]))
    assert.equal(tiles.Impressions, 1300)
    assert.equal(tiles['Page views'], 140)
  } finally { restore() }
})

test('traffic rows keep unknown listings', async () => {
  const { analytics, restore } = load(fixtures())
  try {
    const rows = (await analytics('tok', {}, { now: NOW })).tables.find((x) => x.id === 'traffic').rows
    assert.equal(rows.find((r) => r.listingId === '111').title, 'Blue jeans')
    assert.equal(rows.find((r) => r.listingId === '222').title, '')
  } finally { restore() }
})

test('seller level shows current and projected cycles', async () => {
  const { analytics, restore } = load(fixtures())
  try {
    const data = await analytics('tok', {}, { now: NOW })
    const s = data.tables.find((x) => x.id === 'standards')
    assert.equal(s.tab, 'Seller level')
    assert.deepEqual(s.rows.map((r) => [r.cycle, r.level]), [['Current', 'Top rated'], ['Projected', 'Above standard']])
    assert.deepEqual([s.rows[0].defectRate, s.rows[0].lateShipmentRate, s.rows[0].casesClosed], ['0.12%', '1.1%', '0%'])
    const svc = data.tables.find((x) => x.id === 'service')
    assert.equal(svc.tab, 'Seller level')
    assert.ok(svc.rows.some((r) => r.category === 'Clothing' && r.rating === 'High' && r.yourRate === '0.8%' && r.peerRate === '0.3%'))
  } finally { restore() }
})

test('a missing scope shows a reconnect message, not the API error', async () => {
  const { analytics, restore } = load((url) => {
    if (url.includes('traffic_report')) throw Object.assign(new Error('Insufficient permissions to fulfill the request.'), { status: 403 })
    return fixtures()(url)
  })
  try {
    const data = await analytics('tok', {}, { now: NOW })
    assert.equal(data.tables.find((x) => x.id === 'traffic').error, 'Reconnect eBay in Settings to allow listing traffic.')
    assert.equal(data.tables.find((x) => x.id === 'standards').rows.length, 2)
  } finally { restore() }
})

test('other API errors are shown as they are', async () => {
  const { scopeAware } = require('../sections/helpers')
  await assert.rejects(scopeAware(async () => { throw Object.assign(new Error('eBay is down'), { status: 500 }) }, 'listing traffic')(), /eBay is down/)
})

test('a seller level row opens its metrics', async () => {
  const { analytics, urls, restore } = load((url) => (url.includes('seller_standards_profile/PROGRAM_US/CURRENT')
    ? { program: 'PROGRAM_US', cycle: { cycleType: 'CURRENT' }, standardsLevel: 'TOP_RATED', metrics: [
      { metricKey: 'DEFECTIVE_TRANSACTION_RATE', value: { value: '0.12' }, benchmark: { rating: 'MEETS_OR_EXCEEDS' } },
      { metricKey: 'TRANSACTION_COUNT', value: '412' },
    ] }
    : fixtures()(url)))
  try {
    const row = (await analytics('tok', {}, { now: NOW })).tables.find((t) => t.id === 'standards').rows[0]
    assert.equal(row.id, 'PROGRAM_US|CURRENT')
    assert.deepEqual(row.actions, [{ id: 'standards', label: 'Metrics', detail: true }])
    const detail = await analytics.details.standards('tok', {}, 'PROGRAM_US|CURRENT')
    assert.ok(urls.includes('/sell/analytics/v1/seller_standards_profile/PROGRAM_US/CURRENT'))
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.metric, r.value, r.benchmark]), [['Defective transaction rate', '0.12', 'Meets or exceeds'], ['Transaction count', '412', '']])
    await assert.rejects(analytics.details.standards('tok', {}, 'PROGRAM_US'), (e) => e.status === 400)
  } finally { restore() }
})

test('daily traffic asks eBay by day for exact calendar days and returns its last day', async () => {
  const day = (d, imp, views, sold) => ({ dimensionValues: [{ value: d }], metricValues: [{ value: imp }, { value: views }, { value: sold }] })
  const report = { endDate: '2026-11-23T07:00:00.000Z', header: { metrics: [{ key: 'LISTING_IMPRESSION_TOTAL' }, { key: 'LISTING_VIEWS_TOTAL' }, { key: 'TRANSACTION' }] }, records: [day('20261122', 500, 20, 1), day('20261123', 300, 10, 0)] }
  const { analytics, urls, restore } = load(() => report)
  try {
    const out = await analytics.dailyTraffic('tok', '2026-11-17', '2026-11-23')
    assert.equal(urls[0], '/sell/analytics/v1/traffic_report?dimension=DAY&metric=LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,TRANSACTION&filter=marketplace_ids:%7BEBAY_US%7D,date_range:%5B20261117..20261123%5D')
    assert.deepEqual(out, { latestDate: '2026-11-23', days: [{ date: '2026-11-22', impressions: 500, views: 20, sold: 1 }, { date: '2026-11-23', impressions: 300, views: 10, sold: 0 }] })
  } finally { restore() }
})

test('seller level and service rows carry eBay codes for the page', async () => {
  const { analytics, restore } = load(fixtures())
  try {
    const data = await analytics('tok', {}, { now: NOW })
    assert.equal(data.tables.find((t) => t.id === 'standards').rows[0].levelCode, 'TOP_RATED')
    assert.equal(data.tables.find((t) => t.id === 'service').rows[0].ratingCode, 'HIGH')
  } finally { restore() }
})
