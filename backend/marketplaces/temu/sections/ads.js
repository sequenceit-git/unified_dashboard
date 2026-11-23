/** Temu "ads" section: its tables (subsections) for the shop section page. */
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { adVal, adMoney, temuAdReport } = require('./helpers')

async function ads(token) {
  let report = null
  const list = await tables([
    {
      id: 'goods',
      title: 'Ads by goods (last 30 days)',
      columns: [col('goodsId', 'Goods'), col('spend', 'Spend', 'money'), col('sales', 'Ad sales', 'money'), col('orders', 'Orders', 'number'), col('roas', 'ROAS', 'number'), col('impressions', 'Impressions', 'number'), col('clicks', 'Clicks', 'number')],
      load: async () => {
        report = await temuAdReport(token, 30)
        return (report?.reportsItemList || []).map((row) => ({
          goodsId: row.goodsId,
          spend: adMoney(row.adSpend),
          sales: adMoney(row.orderPayAmt),
          orders: adVal(row.orderPayCnt),
          roas: adVal(row.roas),
          impressions: adVal(row.imprCnt),
          clicks: adVal(row.clkCnt),
        }))
      },
    },
  ])
  const totals = report?.reportsSummary || {}
  const summary = report?.summary || {}
  const pick = (all, key) => adVal(totals[all]) ?? adVal(summary[key]?.ad)
  return {
    summary: [
      { label: 'Ad spend', value: pick('adSpendAll', 'spend'), type: 'number' },
      { label: 'Ad sales', value: pick('orderPayAmtAll', 'orderPayAmt'), type: 'number' },
      { label: 'ROAS', value: pick('roasAll', 'roas'), type: 'number' },
      { label: 'Orders', value: pick('orderPayCntAll', 'orderPayCnt'), type: 'number' },
    ],
    tables: list,
  }
}

module.exports = ads
