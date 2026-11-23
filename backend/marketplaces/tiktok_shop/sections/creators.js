/** tiktok_shop "creators" section: its tables (subsections) for the shop section page. */
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttPost } = require('./helpers')

async function creators(token, shop) {
  const list = await tables([{
    id: 'creators',
    title: 'Marketplace creators',
    columns: [
      col('nickname', 'Creator'),
      col('username', 'Handle'),
      col('followers', 'Followers', 'number'),
      col('gmv', 'GMV', 'money'),
      col('avgVideoViews', 'Avg video views', 'number'),
      col('avgLiveViewers', 'Avg LIVE viewers', 'number'),
    ],
    load: async () => {
      let data
      try {
        data = await ttPost(token, shop, '/affiliate_seller/202508/marketplace_creators/search', {}, { page_size: 20 })
      } catch (err) {
        if (!/version|not found|404/i.test(err.message || '')) throw err
        data = await ttPost(token, shop, '/affiliate_seller/202505/marketplace_creators/search', {}, { page_size: 20 })
      }
      return data.creators?.map((row) => ({
      nickname: row.nickname || row.username || 'Creator',
      username: row.username ? `@${String(row.username).replace(/^@/, '')}` : '',
      followers: Number(row.follower_count ?? 0),
      gmv: row.gmv?.amount != null
        ? ttMoney(row.gmv.amount, row.gmv.currency)
        : (row.gmv_range?.minimum_amount != null ? ttMoney(row.gmv_range.minimum_amount, row.gmv_range.currency) : null),
      avgVideoViews: Number(row.avg_ec_video_view_count ?? 0),
      avgLiveViewers: Number(row.avg_ec_live_uv ?? 0),
    })) || []
    },
  }])
  return {
    summary: [{ label: 'Creators', value: list[0].rows.length, type: 'number' }],
    tables: list,
  }
}

module.exports = creators
