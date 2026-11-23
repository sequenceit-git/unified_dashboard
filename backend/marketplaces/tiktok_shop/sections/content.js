/** tiktok_shop "content" section: its tables (subsections) for the shop section page. */
const { seconds, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttGet, ttRange } = require('./helpers')

async function content(token, shop) {
  const range = ttRange(30)
  const gmv = (perf) => ttMoney(perf?.gmv?.amount, perf?.gmv?.currency)
  const callWithFallback = async (primary, fallback) => {
    try {
      return await ttGet(token, shop, primary, { ...range, page_size: 50 })
    } catch (err) {
      if (!/version|not found|404/i.test(err.message || '')) throw err
      return ttGet(token, shop, fallback, { ...range, page_size: 50 })
    }
  }
  const list = await tables([
    {
      id: 'videos',
      title: 'Shoppable videos (last 30 days)',
      columns: [col('title', 'Video'), col('creator', 'Creator'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => (await callWithFallback('/analytics/202509/shop_videos/performance', '/analytics/202409/shop_videos/performance')).videos?.map((row) => ({
        title: row.title || row.id,
        creator: row.username || '',
        posted: row.video_post_time
          ? (/^\d+$/.test(String(row.video_post_time)) ? seconds(row.video_post_time) : String(row.video_post_time).replace(' ', 'T'))
          : null,
        views: Number(row.views ?? 0),
        orders: Number(row.sku_orders ?? 0),
        gmv: gmv(row),
      })) || [],
    },
    {
      id: 'lives',
      title: 'LIVE sessions (last 30 days)',
      columns: [col('title', 'Session'), col('creator', 'Host'), col('start', 'Started', 'date'), col('viewers', 'Viewers', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: async () => (await callWithFallback('/analytics/202509/shop_lives/performance', '/analytics/202508/shop_lives/performance')).live_stream_sessions?.map((row) => ({
        title: row.title || row.id,
        creator: row.username || '',
        start: seconds(row.start_time),
        viewers: Number(row.interaction_performance?.viewers ?? row.viewers ?? 0),
        orders: Number(row.sales_performance?.sku_orders ?? 0),
        gmv: gmv(row.sales_performance),
      })) || [],
    },
  ])
  return {
    summary: [
      { label: 'Videos', value: list[0].rows.length, type: 'number' },
      { label: 'LIVE sessions', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = content
