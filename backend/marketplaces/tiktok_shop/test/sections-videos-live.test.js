const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const MONEY = (a) => ({ amount: String(a), currency: 'USD' })
const DATA = {
  '/analytics/202509/shop_videos/performance': { videos: [{ id: '701', title: 'Unboxing', username: 'shop', views: 900, sku_orders: 4, gmv: MONEY(80) }] },
  '/analytics/202509/shop_lives/performance': { live_stream_sessions: [{ id: '901', title: 'Friday live', username: 'host', start_time: 1764000000, viewers: 50, sku_orders: 2, gmv: MONEY(30) }] },
  '/analytics/202609/shop_videos/batch_performance': { videos: [{ video_id: '701', video: { id: '701', title: 'Unboxing', video_post_time: '2026-11-10 10:00:00' }, performance: { intervals: [
    { traffic: { views: 600, likes: 40 }, sales: { overall: { gmv: MONEY(50), items_sold: 3, product_clicks: 70, product_impressions: 900 } } },
    { traffic: { views: 300, likes: 10 }, sales: { overall: { gmv: MONEY(30), items_sold: 1, product_clicks: 20, product_impressions: 400 } } },
  ] } }] },
  '/analytics/202609/shop_videos/overview_performance': { performance: { intervals: [{ video_views: 900, product_clicks: 90, video_gmv: MONEY(80), ctr: '0.1' }] } },
  '/analytics/202609/shop_lives/overview_performance': { performance: { intervals: [{ views: 400, live_gmv: MONEY(30), live_attributed_sku_orders: 2 }] } },
  '/analytics/202509/shop_videos/701/products/performance': { products: [{ id: 'P1', name: 'Phone case', units_sold: 3, gmv: MONEY(50), product_clicks: 70 }] },
  '/analytics/202509/shop_videos/701/performance': { performance: { intervals: [{ start_date: '2026-11-10', traffic: { views: 600 }, sales: { overall: { gmv: MONEY(50), items_sold: 3 } } }] } },
  '/analytics/202510/shop_lives/901/performance_per_minutes': { performance: { intervals: [{ start_time: 1764000000, sales: { gmv: MONEY(10), items_sold: 1 }, traffic: { viewers: 30, product_clicks: 5 } }, { start_time: 1764000060, sales: { gmv: MONEY(20), items_sold: 1 }, traffic: { viewers: 42, product_clicks: 9 } }] } },
  '/analytics/202512/shop/901/products_performance': { products: [{ id: 'P2', name: 'Live tripod', product_clicks: 25, sku_orders: 2, units_sold: 2, gmv: MONEY(30) }] },
  '/analytics/202511/videos/bestselling': { videos: [{ id: 'BV1', rank: 1, nick_name: 'creator1', views: 5000, likes: 320, gmv_range: '$300 - $500', product_infos: [{ product_name: 'Top clip' }] }] },
  '/analytics/202511/lives/bestselling': { lives: [{ id: 'BL1', rank: 1, title: 'Top live', creator_nick_name: 'host1', duration: 3600, gmv_range: '$200 - $400' }] },
  '/analytics/202511/products/bestselling': { products: [{ id: 'BP1', rank: 1, name: 'Hero item', shop_name: 'Demo Shop', rating: '4.9', gmv_range: '$500 - $1000' }] },
  '/analytics/202511/creators/bestselling': { creators: [{ open_id: 'C1', rank: 1, nick_name: 'Alice', user_name: 'alice_shop', followers_count: 12000, gmv_range: '$250 - $500' }] },
}

function load() {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push([path, query])
        if (!DATA[path]) throw new Error(`unexpected ${path}`)
        return DATA[path]
      },
    },
  })
  return { videos: freshRequire('marketplaces/tiktok_shop/sections/videos-live.js'), calls, restore }
}

test('video results list views to GMV per video', async () => {
  const { videos, calls, restore } = load()
  try {
    const data = await videos('tok', {})
    const t = data.tables.find((x) => x.id === 'videoResults')
    assert.equal(t.tab, 'Video results')
    assert.deepEqual([t.rows[0].title, t.rows[0].views, t.rows[0].productClicks, t.rows[0].itemsSold, t.rows[0].gmv.value], ['Unboxing', 900, 90, 4, 80])
    assert.equal(calls.find(([p]) => p.endsWith('batch_performance'))[1].video_ids, '701')
    assert.ok(data.summary.some((s) => s.tab === 'Video results' && s.label === 'Video views' && s.value === 900))
    assert.ok(data.summary.some((s) => s.tab === 'LIVE results' && s.label === 'LIVE GMV'))
    assert.deepEqual(data.tables.map((x) => x.tab), ['Videos & LIVE', 'Videos & LIVE', 'Video results', 'LIVE results', 'Bestsellers', 'Bestsellers', 'Bestsellers', 'Bestsellers'])
    const topProducts = data.tables.find((x) => x.id === 'bestsellingProducts')
    assert.deepEqual([topProducts.rows[0].title, topProducts.rows[0].shopOrRating, topProducts.rows[0].gmvRange], ['Hero item', 'Demo Shop · ★ 4.9', '$500 - $1000'])
    for (const suffix of ['shop_videos/performance', 'shop_lives/performance', 'shop_videos/overview_performance', 'shop_lives/overview_performance']) {
      const hit = calls.find(([p]) => p.endsWith(suffix))
      assert.equal(hit?.[1]?.account_type, 'ALL', `expected account_type=ALL on ${suffix}`)
    }
    for (const suffix of ['videos/bestselling', 'lives/bestselling', 'products/bestselling', 'creators/bestselling']) {
      const hit = calls.find(([p]) => p.endsWith(suffix))
      assert.match(String(hit?.[1]?.date), /^\d{4}-\d{2}-\d{2}$/, `expected date on ${suffix}`)
      assert.equal(hit?.[1]?.time_slot, '30D', `expected time_slot=30D on ${suffix}`)
    }
    assert.equal(calls.find(([p]) => p.endsWith('creators/bestselling'))?.[1]?.author_type, 'ALL')
  } finally { restore() }
})

test('bestselling retries once with latest available date when TikTok reports data lag', async () => {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push([path, query])
        if (path === '/analytics/202511/lives/bestselling' && query.date !== '2026-11-20') {
          throw new Error('invalid date; latest available date is 2026-11-20')
        }
        return DATA[path] || {}
      },
    },
  })
  try {
    const videos = freshRequire('marketplaces/tiktok_shop/sections/videos-live.js')
    const data = await videos('tok', {}, { now: new Date('2026-11-24T10:00:00Z') })
    const liveTable = data.tables.find((x) => x.id === 'bestsellingLives')
    assert.equal(liveTable.error, undefined)
    assert.equal(liveTable.rows[0].title, 'Top live')
    const liveCalls = calls.filter(([p]) => p === '/analytics/202511/lives/bestselling')
    assert.deepEqual(liveCalls.map(([, q]) => q.date), ['2026-11-22', '2026-11-20'])
  } finally { restore() }
})

test('video detail shows the products sold from it', async () => {
  const { videos, restore } = load()
  try {
    const rows = (await videos('tok', {})).tables.find((x) => x.id === 'videos').rows
    assert.deepEqual(rows[0].actions, [{ id: 'video', label: 'Details', detail: true }])
    const detail = await videos.details.video('tok', {}, '701')
    assert.deepEqual(detail.tables.map((t) => t.id), ['products', 'days'])
    assert.deepEqual([detail.tables[0].rows[0].product, detail.tables[0].rows[0].unitsSold], ['Phone case', 3])
  } finally { restore() }
})

test('live detail is per minute and includes products sold', async () => {
  const { videos, restore } = load()
  try {
    const rows = (await videos('tok', {})).tables.find((x) => x.id === 'lives').rows
    assert.equal(rows[0].id, '901')
    const detail = await videos.details.live('tok', {}, '901')
    assert.deepEqual(detail.tables.map((t) => t.id), ['minutes', 'products'])
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.viewers, r.gmv.value]), [[30, 10], [42, 20]])
    assert.deepEqual([detail.tables[1].rows[0].product, detail.tables[1].rows[0].unitsSold], ['Live tripod', 2])
  } finally { restore() }
})
