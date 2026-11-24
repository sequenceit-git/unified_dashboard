const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const NOW = new Date('2026-11-24T10:00:00Z')
const MONEY = (a) => ({ amount: String(a), currency: 'USD' })
const DATA = {
  '/analytics/202509/shop_skus/performance': { skus: [{ id: 11, product_id: 1, gmv: MONEY(50), sku_orders: 2, units_sold: 3 }, { id: 22, product_id: 2, gmv: MONEY(90), sku_orders: 5, units_sold: 6 }] },
  '/analytics/202610/shop_performances/overview': { sps_score: '4.2', sps_tier_text: 'Good', peer_percentile: '70', dimensions: [{ name: 'Fulfillment', score: '4.5', status_text: 'Good' }] },
  '/analytics/202610/shop_performances/benefits': { benefits: [{ benefit_name: 'Free shipping boost', is_unlocked: true }] },
  '/analytics/202606/shop_performances/metrics': { metrics: [{ metric_code: 'a/b c', metric_name: 'Late dispatch rate', value: '2.1', value_unit: '%', status_text: 'Needs work', benchmarks: { excellent_threshold: '1', poor_threshold: '4' } }] },
  '/analytics/202510/shop/performance/2026-11-24/performance_per_hour': { performance: { intervals: [{ index: 9, gmv: MONEY(12), orders_count: 1, visitors: 40 }] } },
}

function load(extra = {}) {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push([path, query])
        const data = { ...DATA, ...extra }[path]
        if (!data) throw new Error(`unexpected ${path}`)
        return data
      },
    },
    'services/marketplace/sectionKit': { ...require('../../../services/marketplace/sectionKit'), listingTitles: async () => new Map([['1', { title: 'Phone case', sku: 'PC1' }]]) },
  })
  return { analytics: freshRequire('marketplaces/tiktok_shop/sections/analytics.js'), calls, restore }
}

test('sku performance lists the last 30 days by GMV', async () => {
  const { analytics, calls, restore } = load()
  try {
    const data = await analytics('tok', { _id: 's1' }, { now: NOW })
    const skus = data.tables.find((t) => t.id === 'skus')
    assert.equal(skus.tab, 'Products')
    assert.deepEqual(skus.rows.map((r) => [r.skuId, r.orders, r.unitsSold, r.gmv.value]), [['22', 5, 6, 90], ['11', 2, 3, 50]])
    const [, query] = calls.find(([p]) => p === '/analytics/202509/shop_skus/performance')
    assert.deepEqual([query.start_date_ge, query.end_date_lt], ['2026-10-25', '2026-11-24'])
    assert.equal(skus.rows[0].actions[0].detail, true)
  } finally { restore() }
})

test('sku performance keeps unknown products', async () => {
  const { analytics, restore } = load()
  try {
    const rows = (await analytics('tok', {}, { now: NOW })).tables.find((t) => t.id === 'skus').rows
    assert.equal(rows.find((r) => r.productId === '1').product, 'Phone case')
    assert.equal(rows.find((r) => r.productId === '2').product, '')
  } finally { restore() }
})

test('shop health shows the score, benefits and each metric', async () => {
  const { analytics, restore } = load()
  try {
    const data = await analytics('tok', {}, { now: NOW })
    const health = data.tables.find((t) => t.id === 'health')
    assert.equal(health.tab, 'Shop health')
    assert.deepEqual([health.rows[0].metric, health.rows[0].value, health.rows[0].status], ['Late dispatch rate', '2.1%', 'Needs work'])
    assert.ok(data.summary.some((s) => s.tab === 'Shop health' && s.label === 'Shop performance score' && s.value === '4.2'))
  } finally { restore() }
})

test('metric codes are encoded in detail calls', async () => {
  const { analytics, calls, restore } = load({
    '/analytics/202606/shop_performances/metrics/a%2Fb%20c/diagnosis': { value: '2.1', value_unit: '%', status_text: 'Needs work', analyses: [{ summaries: ['Most late orders ship on Mondays'] }] },
    '/analytics/202606/shop_performances/metrics/a%2Fb%20c/problem_details': { otdr_problem_order_items: [{ order_id: 'O1', expect_deliver_time: 1, actual_deliver_time: 2 }] },
    '/analytics/202606/shop_performances/metrics/a%2Fb%20c/top_items': { otdr_logistics_items: [{ logistics_provider: 'USPS', on_time_deliver_rate: '90' }] },
  })
  try {
    const detail = await analytics.details.metric('tok', {}, 'a/b c')
    assert.ok(calls.some(([p]) => p === '/analytics/202606/shop_performances/metrics/a%2Fb%20c/diagnosis'))
    assert.deepEqual(detail.tables.map((t) => t.id), ['diagnosis', 'problems', 'top'])
    assert.equal(detail.tables[1].rows[0].order_id, 'O1')
    assert.equal(detail.tables[2].rows[0].logistics_provider, 'USPS')
  } finally { restore() }
})

test('hourly performance asks for today', async () => {
  const { analytics, restore } = load()
  try {
    const hourly = (await analytics('tok', {}, { now: NOW })).tables.find((t) => t.id === 'hourly')
    assert.equal(hourly.tab, 'Today by hour')
    assert.deepEqual([hourly.rows[0].hour, hourly.rows[0].gmv.value, hourly.rows[0].visitors], ['09:00', 12, 40])
  } finally { restore() }
})

test('a detail action runs the section file’s own detail', async () => {
  let got = null
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/sections.js')
    const adapter = require('../index.js')
    const real = adapter.sections.analytics.details
    adapter.sections.analytics.details = { metric: async (token, shop, id) => { got = [token, id]; return { title: 'x', tables: [] } } }
    try {
      const admin = { user: { role: 'super_admin' }, params: { sectionId: 'analytics', actionId: 'metric' }, query: { id: 'a/b' }, body: {} }
      assert.deepEqual(await service.sectionDetail(admin), { title: 'x', tables: [] })
      assert.deepEqual(got, ['tok', 'a/b'])
      await assert.rejects(service.sectionDetail({ ...admin, params: { sectionId: 'analytics', actionId: 'nope' } }), (e) => e.status === 404)
      const sub = { user: { id: 'u2', role: 'sub_admin', allowedSections: ['tiktok_shop:orders'] }, allowedShopIds: ['s1'], params: { sectionId: 'analytics', actionId: 'metric' }, query: { id: 'a' }, body: {} }
      await assert.rejects(service.sectionDetail(sub), (e) => e.status === 403)
    } finally { adapter.sections.analytics.details = real }
  } finally { restore() }
})
