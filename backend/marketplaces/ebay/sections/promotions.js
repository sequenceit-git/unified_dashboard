/** ebay "promotions" section: its tables (subsections) for the shop section page. */
const { words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')

async function promotions(token) {
  const list = await tables([{
    id: 'promotions',
    title: 'Promotions',
    columns: [col('name', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
    load: async () => (await ebayGet(token, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=100')).promotions?.map((row) => ({
      promotionId: row.promotionId,
      name: row.name,
      type: words(row.promotionType),
      status: words(row.promotionStatus),
      start: row.startDate,
      end: row.endDate,
    })) || [],
  }])
  const rows = list[0].rows
  return {
    summary: [
      { label: 'Running', value: rows.filter((row) => /running/i.test(row.status)).length, type: 'number' },
      { label: 'Scheduled', value: rows.filter((row) => /scheduled/i.test(row.status)).length, type: 'number' },
      { label: 'Total', value: rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = promotions
