/**
 * Temu "ads" section: the shop's ad report (overview, by goods), then a deeper report per product
 * (impressions to ROAS, ad-only figures) for the goods with the most ad spend.
 */
const temu = require('../service')
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { adVal, adMoney, temuAdReport } = require('./helpers')

const TOP_GOODS = 20

async function ads(token) {
  let report = null
  const period = {}
  const list = await tables([
    {
      id: 'goods',
      tab: 'Overview',
      title: 'Ads by goods (last 30 days)',
      columns: [col('goodsId', 'Goods'), col('spend', 'Spend', 'money'), col('sales', 'Ad sales', 'money'), col('orders', 'Orders', 'number'), col('roas', 'ROAS', 'number'), col('impressions', 'Impressions', 'number'), col('clicks', 'Clicks', 'number')],
      load: async () => {
        report = await temuAdReport(token, 30, period)
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
  // Per-product reports for the goods with the most spend, over the same period as the shop report.
  const [byProduct] = await tables([{
    id: 'goodsReport',
    tab: 'By product',
    title: `Results per product (top ${TOP_GOODS} by spend, last 30 days)`,
    note: 'Ad-only figures from Temu for each product: from impressions to orders, spend and return on ad spend.',
    columns: [col('goodsId', 'Goods'), col('impressions', 'Impressions', 'number'), col('clicks', 'Clicks', 'number'), col('ctr', 'CTR %', 'number'), col('carts', 'Add to cart', 'number'), col('orders', 'Orders', 'number'), col('sales', 'Ad sales', 'money'), col('spend', 'Spend', 'money'), col('roas', 'ROAS', 'number')],
    load: async () => {
      const top = [...(report?.reportsItemList || [])].sort((a, b) => (adVal(b.adSpend) || 0) - (adVal(a.adSpend) || 0)).slice(0, TOP_GOODS)
      if (!top.length || period.startTs == null) return []
      const rows = await Promise.all(top.map(async (item) => {
        const res = await temu.call('temu.searchrec.ad.reports.goods.query', { access_token: token, goodsId: Number(item.goodsId), startTs: period.startTs, endTs: period.endTs })
        const s = res?.reportInfo?.summary || {}
        const ad = (key) => adVal(s[key]?.ad)
        const ctr = ad('ctr')
        return {
          goodsId: String(item.goodsId),
          impressions: ad('imprCnt'),
          clicks: ad('clkCnt'),
          ctr: ctr == null ? null : Math.round(ctr * 1000) / 10,
          carts: ad('cartCnt'),
          orders: ad('orderPayCnt'),
          sales: adMoney(s.orderPayAmt?.ad),
          spend: adMoney(s.spend?.ad),
          roas: ad('roas'),
        }
      }))
      return rows.sort((a, b) => (b.spend?.value || 0) - (a.spend?.value || 0))
    },
  }])
  list.push(byProduct)
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
