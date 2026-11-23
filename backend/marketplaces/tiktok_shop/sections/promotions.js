/** tiktok_shop "promotions" section: its tables (subsections) for the shop section page. */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttPost } = require('./helpers')

async function promotions(token, shop) {
  const list = await tables([
    {
      id: 'activities',
      title: 'Promotions',
      columns: [col('title', 'Name'), col('type', 'Type'), col('scope', 'Applies to'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
      load: async () => (await ttPost(token, shop, '/promotion/202309/activities/search', { page_size: 100 }, {})).activities?.map((row) => ({
        id: row.id || row.activity_id,
        promotionId: row.id || row.activity_id,
        title: row.title,
        type: words(row.activity_type),
        scope: row.product_level === 'SHOP' ? 'Whole shop' : words(row.product_level),
        status: words(row.status),
        start: seconds(row.begin_time),
        end: row.duration_type === 'INDEFINITE' ? null : seconds(row.end_time),
      })) || [],
    },
    {
      id: 'coupons',
      title: 'Coupons',
      columns: [col('title', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
      load: async () => (await ttPost(token, shop, '/promotion/202406/coupons/search')).coupons?.map((row) => ({
        title: row.title || row.name || row.id,
        type: words(row.display_type || row.coupon_type),
        status: words(row.status),
        start: seconds(row.redemption_duration?.start_time || row.claim_duration?.start_time || row.start_time),
        end: seconds(row.redemption_duration?.end_time || row.claim_duration?.end_time || row.end_time),
      })) || [],
    },
  ])
  return {
    summary: [
      { label: 'Ongoing promotions', value: list[0].rows.filter((row) => /ongoing/i.test(row.status)).length, type: 'number' },
      { label: 'Coupons', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = promotions
