/**
 * TikTok Shop "videos-live" section: shoppable videos and LIVE sessions (first tab), then video
 * results (views to GMV per video, from the batch call) and LIVE results by day. `details` open a
 * video's products and daily results, or a LIVE session minute by minute.
 */
const { seconds, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttGet, ttRange, scopeAware } = require('./helpers')

const SCOPE = 'TikTok Shop Analytics'
const money = (m) => (m ? ttMoney(m.amount, m.currency) : null)
const add = (a, b) => (a || b ? { value: Math.round(((a?.value || 0) + (b?.value || 0)) * 100) / 100, currency: a?.currency || b?.currency || 'USD' } : null)
const postTime = (t) => (t ? (/^\d+$/.test(String(t)) ? seconds(t) : String(t).replace(' ', 'T')) : null)
const enc = encodeURIComponent
const TOP_VIDEOS = 20

async function videosLive(token, shop, { now = new Date() } = {}) {
  const range = ttRange(30, now)
  const callWithFallback = async (primary, fallback) => {
    try {
      return await ttGet(token, shop, primary, { ...range, page_size: 50 })
    } catch (err) {
      if (!/version|not found|404/i.test(err.message || '')) throw err
      return ttGet(token, shop, fallback, { ...range, page_size: 50 })
    }
  }
  let videoIds = []
  const tiles = []
  const list = await tables([
    {
      id: 'videos',
      tab: 'Videos & LIVE',
      title: 'Shoppable videos (last 30 days)',
      columns: [col('title', 'Video'), col('creator', 'Creator'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => {
        const rows = (await callWithFallback('/analytics/202509/shop_videos/performance', '/analytics/202409/shop_videos/performance')).videos?.map((row) => ({
          id: String(row.id),
          title: row.title || row.id,
          creator: row.username || '',
          posted: postTime(row.video_post_time),
          views: Number(row.views ?? 0),
          orders: Number(row.sku_orders ?? 0),
          gmv: money(row.gmv),
          actions: [{ id: 'video', label: 'Details', detail: true }],
        })) || []
        videoIds = rows.map((r) => r.id).filter(Boolean)
        return rows
      },
    },
    {
      id: 'lives',
      tab: 'Videos & LIVE',
      title: 'LIVE sessions (last 30 days)',
      columns: [col('title', 'Session'), col('creator', 'Host'), col('start', 'Started', 'date'), col('viewers', 'Viewers', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => (await callWithFallback('/analytics/202509/shop_lives/performance', '/analytics/202508/shop_lives/performance')).live_stream_sessions?.map((row) => ({
        id: String(row.id),
        title: row.title || row.id,
        creator: row.username || '',
        start: seconds(row.start_time),
        viewers: Number(row.interaction_performance?.viewers ?? row.viewers ?? 0),
        orders: Number(row.sales_performance?.sku_orders ?? 0),
        gmv: money(row.sales_performance?.gmv),
        actions: [{ id: 'live', label: 'Per minute', detail: true }],
      })) || [],
    },
  ])
  const results = await tables([
    {
      id: 'videoResults',
      tab: 'Video results',
      title: `Results per video (top ${TOP_VIDEOS}, last 30 days)`,
      note: 'Views, product clicks and sales each video brought in.',
      columns: [col('title', 'Video'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('likes', 'Likes', 'number'), col('productClicks', 'Product clicks', 'number'), col('itemsSold', 'Items sold', 'number'), col('gmv', 'GMV', 'money')],
      load: scopeAware(async () => {
        const [overview, batch] = await Promise.all([
          ttGet(token, shop, '/analytics/202609/shop_videos/overview_performance', range).catch(() => null),
          videoIds.length
            ? ttGet(token, shop, '/analytics/202609/shop_videos/batch_performance', { ...range, video_ids: videoIds.slice(0, TOP_VIDEOS).join(',') })
            : { videos: [] },
        ])
        const total = (overview?.performance?.intervals || []).reduce((t, i) => ({
          views: t.views + (i.video_views || 0),
          clicks: t.clicks + (i.product_clicks || 0),
          gmv: add(t.gmv, money(i.video_gmv)),
        }), { views: 0, clicks: 0, gmv: null })
        if (overview) {
          tiles.push(
            { tab: 'Video results', label: 'Video views', value: total.views, type: 'number' },
            { tab: 'Video results', label: 'Product clicks', value: total.clicks, type: 'number' },
            { tab: 'Video results', label: 'Video GMV', value: total.gmv, type: 'money' },
          )
        }
        return (batch.videos || []).filter((v) => !v.error?.code).map((v) => {
          const sum = (v.performance?.intervals || []).reduce((t, i) => ({
            views: t.views + (i.traffic?.views || 0),
            likes: t.likes + (i.traffic?.likes || 0),
            productClicks: t.productClicks + (i.sales?.overall?.product_clicks || 0),
            itemsSold: t.itemsSold + (i.sales?.overall?.items_sold || 0),
            gmv: add(t.gmv, money(i.sales?.overall?.gmv)),
          }), { views: 0, likes: 0, productClicks: 0, itemsSold: 0, gmv: null })
          return { id: String(v.video_id), title: v.video?.title || v.video_id, posted: postTime(v.video?.video_post_time), ...sum, actions: [{ id: 'video', label: 'Details', detail: true }] }
        }).sort((a, b) => (b.gmv?.value || 0) - (a.gmv?.value || 0))
      }, SCOPE),
    },
    {
      id: 'liveDays',
      tab: 'LIVE results',
      title: 'LIVE by day (last 30 days)',
      columns: [col('date', 'Date', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'LIVE GMV', 'money')],
      load: scopeAware(async () => {
        const res = await ttGet(token, shop, '/analytics/202609/shop_lives/overview_performance', { ...range, granularity: '1D' })
        const days = (res.performance?.intervals || []).map((i) => ({ date: i.start_date || null, views: i.views || 0, orders: i.live_attributed_sku_orders || 0, gmv: money(i.live_gmv) }))
        tiles.push(
          { tab: 'LIVE results', label: 'LIVE views', value: days.reduce((t, d) => t + d.views, 0), type: 'number' },
          { tab: 'LIVE results', label: 'LIVE GMV', value: days.reduce((t, d) => add(t, d.gmv), null), type: 'money' },
        )
        return days
      }, SCOPE),
    },
  ])
  return {
    summary: [
      { tab: 'Videos & LIVE', label: 'Videos', value: list[0].rows.length, type: 'number' },
      { tab: 'Videos & LIVE', label: 'LIVE sessions', value: list[1].rows.length, type: 'number' },
      ...tiles,
    ],
    tables: [...list, ...results],
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, tables }`. */
videosLive.details = {
  /** A video: the products it sold, and its results by day. */
  video: async (token, shop, id, { now = new Date() } = {}) => {
    const range = ttRange(30, now)
    const [products, perf] = await Promise.all([
      ttGet(token, shop, `/analytics/202509/shop_videos/${enc(id)}/products/performance`, { ...range, page_size: 50 }),
      ttGet(token, shop, `/analytics/202509/shop_videos/${enc(id)}/performance`, { ...range, granularity: '1D' }).catch(() => null),
    ])
    return {
      title: `Video ${id}`,
      tables: [
        {
          id: 'products',
          title: 'Products sold from this video',
          columns: [col('product', 'Product'), col('productClicks', 'Clicks', 'number'), col('unitsSold', 'Units sold', 'number'), col('gmv', 'GMV', 'money')],
          rows: (products.products || []).map((p) => ({ product: p.name || p.id, productClicks: p.product_clicks ?? 0, unitsSold: p.units_sold ?? 0, gmv: money(p.gmv) })),
        },
        {
          id: 'days',
          title: 'By day',
          columns: [col('date', 'Date', 'date'), col('views', 'Views', 'number'), col('itemsSold', 'Items sold', 'number'), col('gmv', 'GMV', 'money')],
          rows: (perf?.performance?.intervals || []).map((i) => ({ date: i.start_date, views: i.traffic?.views ?? 0, itemsSold: i.sales?.overall?.items_sold ?? 0, gmv: money(i.sales?.overall?.gmv) })),
        },
      ],
    }
  },
  /** A LIVE session minute by minute: viewers, clicks and sales. */
  live: async (token, shop, id) => {
    const res = await ttGet(token, shop, `/analytics/202510/shop_lives/${enc(id)}/performance_per_minutes`)
    return {
      title: res.performance?.overall?.live_title || `LIVE ${id}`,
      tables: [{
        id: 'minutes',
        title: 'Minute by minute',
        columns: [col('time', 'Time (UTC)'), col('viewers', 'Viewers', 'number'), col('productClicks', 'Product clicks', 'number'), col('itemsSold', 'Items sold', 'number'), col('gmv', 'GMV', 'money')],
        rows: (res.performance?.intervals || []).map((i) => ({
          time: i.start_time ? new Date(Number(i.start_time) * 1000).toISOString().slice(11, 16) : '',
          viewers: i.traffic?.viewers ?? 0,
          productClicks: i.traffic?.product_clicks ?? 0,
          itemsSold: i.sales?.items_sold ?? 0,
          gmv: money(i.sales?.gmv),
        })),
      }],
    }
  },
}

module.exports = videosLive
