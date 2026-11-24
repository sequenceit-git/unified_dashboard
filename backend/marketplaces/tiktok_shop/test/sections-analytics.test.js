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
        if (data instanceof Error) throw data
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
    assert.ok('statusCode' in health.rows[0])
    assert.ok(data.summary.some((s) => s.tab === 'Shop health' && s.label === 'Shop performance score' && s.value === '4.2'))
    assert.equal(data.summary.find((s) => s.label === 'Shop performance score').id, 'sps-score')
    assert.ok(data.summary.filter((s) => s.id === 'benefits' || s.id === 'peers' || s.id === 'dimension').length >= 1)
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

test('built-in object names are not details or actions (no token leak)', async () => {
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('SECRET-TOKEN') },
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/sections.js')
    for (const actionId of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      const ctx = { user: { role: 'super_admin' }, params: { sectionId: 'analytics', actionId }, query: { id: '1' }, body: { id: '1' } }
      await assert.rejects(service.sectionDetail(ctx), (e) => e.status === 404, `detail ${actionId}`)
      await assert.rejects(service.sectionAction(ctx), (e) => e.status === 404, `action ${actionId}`)
    }
  } finally { restore() }
})

test("a shop TikTok hasn't scored yet reads as not scored, not as an error", async () => {
  const notFound = Object.assign(new Error('Resource Not Found. No `shop performance data` matches `7494810167041885955`. Please verify the identifier and retry.'), { code: 36009004 })
  const { analytics, restore } = load({
    '/analytics/202606/shop_performances/metrics': notFound,
    '/analytics/202610/shop_performances/overview': notFound,
    '/analytics/202610/shop_performances/benefits': notFound,
  })
  try {
    const data = await analytics('tok', {}, { now: NOW })
    const health = data.tables.find((t) => t.id === 'health')
    assert.equal(health.error, undefined)
    assert.deepEqual(health.rows, [])
    assert.ok(data.summary.some((s) => s.id === 'sps-unscored'))
  } finally { restore() }
})

test('other shop health failures still show as errors', async () => {
  const { analytics, restore } = load({ '/analytics/202606/shop_performances/metrics': new Error('upstream timeout') })
  try {
    const health = (await analytics('tok', {}, { now: NOW })).tables.find((t) => t.id === 'health')
    assert.match(health.error, /timeout/)
  } finally { restore() }
})

test('Audience (ACC) and Off-site & pixels tabs populate tiles and tables', async () => {
  const { analytics, restore } = load({
    '/analytics/202610/acc/overview': { total_customers: 4200 },
    '/analytics/202610/acc/penetration': { penetration_rate: 18.5 },
    '/analytics/202610/acc/preferences/summary': { top_category: 'Home & Kitchen' },
    '/analytics/202610/acc/preferences': { preferences: [{ name: 'Repeat buyers', dimension: 'Loyalty', share: 42, orders: 120, gmv: MONEY(3200) }] },
    '/analytics/202610/acc/preferences/product/categories': { categories: [{ category_name: 'Kitchen', affinity_index: '1.4', share: 60, gmv: MONEY(2100) }] },
    '/analytics/202610/acc/preferences/live/factors': { factors: [{ factor_name: 'Live demos', impact: 'High', description: 'Boosts conversion' }] },
    '/analytics/202610/acc/brands': { brands: [{ brand_name: 'BrandA', affinity_index: '1.2', share: 30 }] },
    '/analytics/202610/off_site/overview': { gmv: MONEY(950), orders: 24, visits: 800 },
    '/analytics/202610/off_site/details': { details: [{ channel_name: 'Search Ads', visits: 500, orders: 15, gmv: MONEY(600), roas: '3.2' }] },
    '/analytics/202610/off_site/insights': { insights: [{ title: 'Evening peak', type: 'Timing', metric_value: '+22%', summary: 'Higher ROAS after 6pm' }] },
    '/analytics/202610/off_site/pixels': { pixels: [{ pixel_id: 'PX1', pixel_name: 'Main Store Pixel', status: 'ACTIVE', events_count: 1400 }] },
  })
  try {
    const data = await analytics('tok', {}, { now: NOW })
    assert.ok(data.summary.some((s) => s.tab === 'Audience (ACC)' && s.label === 'Audience reach' && s.value === 4200))
    assert.ok(data.summary.some((s) => s.tab === 'Off-site & pixels' && s.label === 'Off-site GMV' && s.value.value === 950))
    assert.equal(data.tables.find((t) => t.id === 'accPreferences').rows[0].name, 'Repeat buyers')
    assert.equal(data.tables.find((t) => t.id === 'accCategories').rows[0].category, 'Kitchen')
    assert.equal(data.tables.find((t) => t.id === 'accLiveFactors').rows[0].factor, 'Live demos')
    assert.equal(data.tables.find((t) => t.id === 'accBrands').rows[0].brand, 'BrandA')
    assert.equal(data.tables.find((t) => t.id === 'offSiteDetails').rows[0].roas, '3.2x')
    assert.equal(data.tables.find((t) => t.id === 'offSiteInsights').rows[0].title, 'Evening peak')
    assert.equal(data.tables.find((t) => t.id === 'offSitePixels').rows[0].pixelId, 'PX1')
  } finally { restore() }
})
