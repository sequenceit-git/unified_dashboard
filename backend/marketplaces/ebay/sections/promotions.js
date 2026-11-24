/**
 * eBay "promotions" section: the shop's promotions, and their results (sales, orders, items,
 * discount given and sales lift) from the Marketing API's promotion reports.
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')

async function promotions(token) {
  let byId = new Map()
  const list = await tables([{
    id: 'promotions',
    tab: 'Promotions',
    title: 'Promotions',
    columns: [col('name', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
    load: async () => {
      const rows = (await ebayGet(token, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=100')).promotions?.map((row) => ({
        promotionId: row.promotionId,
        name: row.name,
        type: words(row.promotionType),
        status: words(row.promotionStatus),
        start: row.startDate,
        end: row.endDate,
      })) || []
      byId = new Map(rows.map((row) => [String(row.promotionId), row]))
      return rows
    },
  }])
  // The report has no names or status: they come from the promotion list loaded above.
  const [results] = await tables([{
    id: 'results',
    tab: 'Results',
    title: 'Results per promotion',
    note: 'What each promotion sold, how much it discounted, and how much it lifted sales.',
    columns: [col('name', 'Promotion'), col('type', 'Type'), col('status', 'Status', 'status'), col('orders', 'Orders', 'number'), col('items', 'Items sold', 'number'), col('promotionSales', 'Sales from promotion', 'money'), col('totalSales', 'Total sales', 'money'), col('discount', 'Discount given', 'money'), col('lift', 'Sales lift %', 'number')],
    load: async () => ((await ebayGet(token, '/sell/marketing/v1/promotion_report?marketplace_id=EBAY_US&limit=50')).promotionReports || []).map((row) => {
      const promo = byId.get(String(row.promotionId))
      return {
        promotionId: row.promotionId,
        name: promo?.name || row.promotionId,
        type: words(row.promotionType),
        status: promo?.status || '',
        orders: row.numberOfOrdersSold ?? 0,
        items: row.itemsSoldQuantity ?? 0,
        promotionSales: money(row.promotionSale),
        totalSales: money(row.totalSale),
        discount: money(row.totalDiscount),
        lift: row.percentageSalesLift != null ? Number(row.percentageSalesLift) : null,
      }
    }),
  }])
  const report = await ebayGet(token, '/sell/marketing/v1/promotion_summary_report?marketplace_id=EBAY_US').catch(() => null)
  const rows = list[0].rows
  return {
    summary: [
      { tab: 'Promotions', label: 'Running', value: rows.filter((row) => /running/i.test(row.status)).length, type: 'number' },
      { tab: 'Promotions', label: 'Scheduled', value: rows.filter((row) => /scheduled/i.test(row.status)).length, type: 'number' },
      { tab: 'Promotions', label: 'Total', value: rows.length, type: 'number' },
      ...(report?.totalSale ? [
        { tab: 'Results', label: 'Sales from promotions', value: money(report.promotionSale), type: 'money' },
        { tab: 'Results', label: 'Total sales', value: money(report.totalSale), type: 'money' },
        { tab: 'Results', label: 'Sales lift', value: Number(report.percentageSalesLift || 0), type: 'percent' },
      ] : []),
    ],
    tables: [...list, results],
  }
}

module.exports = promotions
