/**
 * TikTok Shop "videos-live" section: shoppable videos and LIVE sessions (first tab), then video
 * results (views to GMV per video, from the batch call) and LIVE results by day. `details` open a
 * video's products and daily results, or a LIVE session minute by minute.
 */
const { seconds, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttGet, ttRange, withVersionFallback, scopeAware } = require('./helpers')

const SCOPE = 'TikTok Shop Analytics'
const money = (m) => (m ? ttMoney(m.amount, m.currency) : null)
const add = (a, b) => (a || b ? { value: Math.round(((a?.value || 0) + (b?.value || 0)) * 100) / 100, currency: a?.currency || b?.currency || 'USD' } : null)
const postTime = (t) => (t ? (/^\d+$/.test(String(t)) ? seconds(t) : String(t).replace(' ', 'T')) : null)
const enc = encodeURIComponent
const TOP_VIDEOS = 20
const linkCol = (key, label, urlKey = 'url') => ({ ...col(key, label), urlKey })
const videoUrl = (id, username) => (id ? `https://www.tiktok.com/@${username ? enc(String(username).replace(/^@/, '')) : '_'}/video/${enc(String(id))}` : '')
const userUrl = (username) => (username ? `https://www.tiktok.com/@${enc(String(username).replace(/^@/, ''))}` : '')
const liveUrl = (username) => (username ? `https://www.tiktok.com/@${enc(String(username).replace(/^@/, ''))}/live` : '')
const shopProductUrl = (id) => (id ? `https://shop.tiktok.com/view/product/${enc(String(id))}` : '')

async function withBestsellingDate(call, now = new Date()) {
  const date = new Date(now - 2 * 86400000).toISOString().slice(0, 10)
  try {
    return await call({ date, time_slot: '30D' })
  } catch (err) {
    const m = String(err?.message || '').match(/\b(20\d{2}-\d{2}-\d{2})\b/)
    if (m && m[1] !== date) return call({ date: m[1], time_slot: '30D' })
    throw err
  }
}

async function videosLive(token, shop, { now = new Date() } = {}) {
  const range = ttRange(30, now)
  const callWithFallback = async (primary, secondary, legacy, accountType = 'ALL') => withVersionFallback(
    () => ttGet(token, shop, primary, { ...range, page_size: 50, account_type: accountType }),
    () => (legacy ? withVersionFallback(
      () => ttGet(token, shop, secondary, { ...range, page_size: 50, account_type: accountType }),
      () => ttGet(token, shop, legacy, { ...range, page_size: 50, account_type: accountType }),
    ) : ttGet(token, shop, secondary, { ...range, page_size: 50, account_type: accountType })),
  )
  let videoIds = []
  const tiles = []
  const list = await tables([
    {
      id: 'videos',
      tab: 'Videos & LIVE',
      title: 'Shoppable videos (last 30 days)',
      columns: [linkCol('title', 'Video'), linkCol('creator', 'Creator', 'creatorUrl'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => {
        const rows = (await callWithFallback('/analytics/202605/shop_videos/performance', '/analytics/202509/shop_videos/performance', '/analytics/202409/shop_videos/performance')).videos?.map((row) => ({
          id: String(row.id),
          title: row.title || row.id,
          url: videoUrl(row.id, row.username),
          creator: row.username || '',
          creatorUrl: userUrl(row.username),
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
      columns: [linkCol('title', 'Session'), linkCol('creator', 'Host', 'creatorUrl'), col('start', 'Started', 'date'), col('viewers', 'Viewers', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => {
        const TYPES = ['OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS', 'AFFILIATE_ACCOUNTS']
        const settled = await Promise.allSettled(TYPES.map((t) => callWithFallback('/analytics/202609/shop_lives/performance', '/analytics/202509/shop_lives/performance', '/analytics/202508/shop_lives/performance', t)))
        const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
        if (!ok.length) throw settled[0].reason
        const seen = new Set()
        const sessions = ok.flatMap((r) => r.live_stream_sessions || []).filter((row) => {
          const id = String(row.id)
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
        return sessions.map((row) => ({
          id: String(row.id),
          title: row.title || row.id,
          url: liveUrl(row.username),
          creator: row.username || '',
          creatorUrl: userUrl(row.username),
          start: seconds(row.start_time),
          viewers: Number(row.interaction_performance?.viewers ?? row.viewers ?? 0),
          orders: Number(row.sales_performance?.sku_orders ?? 0),
          gmv: money(row.sales_performance?.gmv),
          actions: [{ id: 'live', label: 'Per minute', detail: true }],
        }))
      },
    },
  ])
  const results = await tables([
    {
      id: 'videoResults',
      tab: 'Video results',
      title: `Results per video (top ${TOP_VIDEOS}, last 30 days)`,
      note: 'Views, product clicks and sales each video brought in.',
      columns: [linkCol('title', 'Video'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('likes', 'Likes', 'number'), col('productClicks', 'Product clicks', 'number'), col('itemsSold', 'Items sold', 'number'), col('gmv', 'GMV', 'money')],
      load: scopeAware(async () => {
        const [overview, batch] = await Promise.all([
          ttGet(token, shop, '/analytics/202609/shop_videos/overview_performance', { ...range, account_type: 'ALL' }).catch(() => null),
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
          return { id: String(v.video_id), title: v.video?.title || v.video_id, url: videoUrl(v.video_id), posted: postTime(v.video?.video_post_time), ...sum, actions: [{ id: 'video', label: 'Details', detail: true }] }
        }).sort((a, b) => (b.gmv?.value || 0) - (a.gmv?.value || 0))
      }, SCOPE),
    },
    {
      id: 'liveDays',
      tab: 'LIVE results',
      title: 'LIVE by day (last 30 days)',
      columns: [col('date', 'Date', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'LIVE GMV', 'money')],
      load: scopeAware(async () => {
        const res = await ttGet(token, shop, '/analytics/202609/shop_lives/overview_performance', { ...range, granularity: '1D', account_type: 'ALL' })
        const days = (res.performance?.intervals || []).map((i) => ({ date: i.start_date || null, views: i.views || 0, orders: i.live_attributed_sku_orders || 0, gmv: money(i.live_gmv) }))
        tiles.push(
          { tab: 'LIVE results', label: 'LIVE views', value: days.reduce((t, d) => t + d.views, 0), type: 'number' },
          { tab: 'LIVE results', label: 'LIVE GMV', value: days.reduce((t, d) => add(t, d.gmv), null), type: 'money' },
        )
        return days
      }, SCOPE),
    },
    {
      id: 'bestsellingVideos',
      tab: 'Bestsellers',
      title: 'Bestselling videos (last 30 days)',
      columns: [col('rank', '#', 'number'), linkCol('title', 'Video / Product'), col('creator', 'Creator'), col('views', 'Views', 'number'), col('likes', 'Likes', 'number'), col('gmvRange', 'GMV')],
      load: scopeAware(async () => {
        const res = await withBestsellingDate((q) => ttGet(token, shop, '/analytics/202511/videos/bestselling', q), now)
        return (res.videos || res.bestselling_videos || []).map((v) => {
          const vid = String(v.id || v.video_id || '')
          return {
            id: vid,
            rank: v.rank ?? null,
            title: v.title || v.video_title || v.product_infos?.[0]?.product_name || vid,
            url: videoUrl(vid) || shopProductUrl(v.product_infos?.[0]?.product_id),
            creator: v.nick_name || v.username || v.creator_name || '',
            views: Number(v.views ?? v.video_views ?? 0),
            likes: Number(v.likes ?? v.sku_orders ?? 0),
            gmvRange: v.gmv_range || (v.gmv?.amount != null ? `${v.gmv.amount} ${v.gmv.currency || 'USD'}` : '—'),
          }
        })
      }, 'Bestsellers'),
    },
    {
      id: 'bestsellingLives',
      tab: 'Bestsellers',
      title: 'Bestselling LIVE sessions (last 30 days)',
      columns: [col('rank', '#', 'number'), linkCol('title', 'Session'), linkCol('creator', 'Creator', 'creatorUrl'), col('durationMin', 'Duration (min)', 'number'), col('gmvRange', 'GMV')],
      load: scopeAware(async () => {
        const res = await withBestsellingDate((q) => ttGet(token, shop, '/analytics/202511/lives/bestselling', q), now)
        return (res.lives || res.live_stream_sessions || res.bestselling_lives || []).map((l) => {
          const handle = l.creator_name || l.username || ''
          return {
            id: String(l.id || l.live_id || ''),
            rank: l.rank ?? null,
            title: l.title || l.live_title || String(l.id || l.live_id || ''),
            url: liveUrl(handle),
            creator: l.creator_nick_name || handle,
            creatorUrl: userUrl(handle),
            durationMin: l.duration != null ? Math.round(Number(l.duration) / 60) : Number(l.viewers ?? 0),
            gmvRange: l.gmv_range || (l.gmv?.amount != null ? `${l.gmv.amount} ${l.gmv.currency || 'USD'}` : '—'),
          }
        })
      }, 'Bestsellers'),
    },
    {
      id: 'bestsellingProducts',
      tab: 'Bestsellers',
      title: 'Bestselling products (last 30 days)',
      columns: [col('rank', '#', 'number'), linkCol('title', 'Product'), linkCol('productId', 'Product ID'), col('shopOrRating', 'Shop / Rating'), col('gmvRange', 'GMV')],
      load: scopeAware(async () => {
        const res = await withBestsellingDate((q) => ttGet(token, shop, '/analytics/202511/products/bestselling', q), now)
        return (res.products || res.bestselling_products || []).map((p) => {
          const pid = String(p.id || p.product_id || '')
          return {
            id: pid,
            rank: p.rank ?? null,
            productId: pid,
            title: p.name || p.title || p.product_name || pid,
            url: shopProductUrl(pid),
            shopOrRating: [p.shop_name, p.rating && `★ ${p.rating}`].filter(Boolean).join(' · ') || (p.units_sold != null ? `${p.units_sold} sold` : ''),
            gmvRange: p.gmv_range || (p.gmv?.amount != null ? `${p.gmv.amount} ${p.gmv.currency || 'USD'}` : '—'),
          }
        })
      }, 'Bestsellers'),
    },
    {
      id: 'bestsellingCreators',
      tab: 'Bestsellers',
      title: 'Bestselling creators (last 30 days)',
      columns: [col('rank', '#', 'number'), linkCol('name', 'Creator'), linkCol('handle', 'Username'), col('followers', 'Followers', 'number'), col('gmvRange', 'GMV')],
      load: scopeAware(async () => {
        const res = await withBestsellingDate((q) => ttGet(token, shop, '/analytics/202511/creators/bestselling', { ...q, author_type: 'ALL' }), now)
        return (res.creators || res.bestselling_creators || []).map((c) => {
          const rawHandle = c.user_name || c.username || ''
          return {
            id: String(c.open_id || c.id || rawHandle),
            rank: c.rank ?? null,
            name: c.nick_name || c.nickname || c.name || rawHandle,
            handle: rawHandle ? `@${String(rawHandle).replace(/^@/, '')}` : '',
            url: userUrl(rawHandle),
            followers: Number(c.followers_count ?? c.units_sold ?? 0),
            gmvRange: c.gmv_range || (c.gmv?.amount != null ? `${c.gmv.amount} ${c.gmv.currency || 'USD'}` : '—'),
          }
        })
      }, 'Bestsellers'),
    },
  ])
  const allTables = [...list, ...results]
  const count = (id) => allTables.find((t) => t.id === id)?.rows.length ?? 0
  return {
    summary: [
      { tab: 'Videos & LIVE', label: 'Videos', value: count('videos'), type: 'number' },
      { tab: 'Videos & LIVE', label: 'LIVE sessions', value: count('lives'), type: 'number' },
      { tab: 'Bestsellers', label: 'Top videos', value: count('bestsellingVideos'), type: 'number' },
      { tab: 'Bestsellers', label: 'Top products', value: count('bestsellingProducts'), type: 'number' },
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
  /** A LIVE session minute by minute and the products it sold. */
  live: async (token, shop, id) => {
    const [res, prodRes] = await Promise.all([
      ttGet(token, shop, `/analytics/202510/shop_lives/${enc(id)}/performance_per_minutes`),
      ttGet(token, shop, `/analytics/202512/shop/${enc(id)}/products_performance`).catch(() => null),
    ])
    const liveTables = [{
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
    }]
    const products = prodRes?.products || prodRes?.performance?.products || []
    if (products.length) {
      liveTables.push({
        id: 'products',
        title: 'Products sold in LIVE',
        columns: [col('product', 'Product'), col('productId', 'ID'), col('clicks', 'Clicks', 'number'), col('orders', 'Orders', 'number'), col('unitsSold', 'Units sold', 'number'), col('gmv', 'GMV', 'money')],
        rows: products.map((p) => ({
          product: p.name || p.title || p.product_name || String(p.id || p.product_id || ''),
          productId: String(p.id || p.product_id || ''),
          clicks: Number(p.product_clicks ?? p.clicks ?? 0),
          orders: Number(p.sku_orders ?? p.orders ?? 0),
          unitsSold: Number(p.units_sold ?? p.items_sold ?? 0),
          gmv: money(p.gmv),
        })),
      })
    }
    return {
      title: res.performance?.overall?.live_title || `LIVE ${id}`,
      tables: liveTables,
    }
  },
}

module.exports = videosLive
