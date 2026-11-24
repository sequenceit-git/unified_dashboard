/**
 * Temu "analytics" section (next to the page's own sales charts): insights from Temu's own data —
 * goods Temu marks as low traffic or traffic-restricted, how much of the shop's sales came from
 * ads, return requests and cancellations per 100 orders over 30 days, and Temu's store tags.
 * Temu has no traffic or conversion report API; these come from the calls it does offer.
 */
const temu = require('../service')
const Order = require('../../../models/Order')
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { adVal, adMoney, temuAdReport, grantAware } = require('./helpers')

const DAYS = 30
const round1 = (n) => Math.round(n * 10) / 10

/** Every goods of the shop from Temu's newer goods list (token paging, up to 20 × 100). */
async function allGoods(token) {
  const all = []
  let pageToken = ''
  for (let page = 0; page < 20; page += 1) {
    const res = await temu.call('temu.local.goods.list.retrieve', { access_token: token, pageSize: 100, ...(pageToken ? { pageToken } : {}) })
    all.push(...(res.goodsList || []))
    pageToken = res.pagination?.nextToken || ''
    if (!pageToken || !(res.goodsList || []).length) break
  }
  return all
}

async function analytics(token, shop, { now = new Date() } = {}) {
  const end = Math.floor(now.getTime() / 1000)
  const start = end - DAYS * 86400
  const [ads, returnsRes, cancelsRes, orders] = await Promise.all([
    grantAware(shop, 'temu.searchrec.ad.reports.mall.query', () => temuAdReport(token, DAYS))().catch(() => null),
    temu.call('bg.aftersales.parentaftersales.list.get', { access_token: token, pageNo: 1, pageSize: 1, createAtStart: start, createAtEnd: end }).catch(() => null),
    temu.call('bg.aftersales.cancel.list.get', { access_token: token, pageNo: 1, pageSize: 1, createAtStart: start, createAtEnd: end }).catch(() => null),
    Order.countDocuments({ shopId: shop?._id, marketplace: 'temu', placedAt: { $gte: new Date(start * 1000) } }).catch(() => 0),
  ])
  const list = await tables([
    {
      id: 'traffic',
      tab: 'Temu insights',
      title: 'Goods Temu shows less',
      note: 'Temu marks these goods as low traffic or restricts their traffic. Check price, photos and compliance in Seller Center.',
      columns: [col('goodsId', 'Goods'), col('title', 'Title'), col('warning', 'Temu says', 'status')],
      load: grantAware(shop, 'temu.local.goods.list.retrieve', async () => (await allGoods(token))
        .filter((g) => Number(g.lowTrafficTag) === 1 || Number(g.restrictedTrafficTag) === 1)
        .map((g) => ({ goodsId: String(g.goodsId), title: g.goodsName || '', warning: Number(g.restrictedTrafficTag) === 1 ? 'Traffic restricted' : 'Low traffic' }))),
    },
    {
      id: 'store',
      tab: 'Temu insights',
      title: 'Store tags',
      note: "Temu's tags on your store (Temu sends codes only).",
      columns: [col('tag', 'Tag')],
      load: grantAware(shop, 'temu.local.mall.tags.get', async () => ((await temu.call('temu.local.mall.tags.get', { access_token: token })).tags || []).map((t) => ({ tag: `Temu tag ${t}` }))),
    },
  ])
  const count = (res) => (res ? Number(res.totalItemNum ?? res.total ?? (res.data || []).length) : null)
  const per100 = (n) => (n != null && orders > 0 ? round1((n / orders) * 100) : null)
  const totalSales = adVal(ads?.summary?.orderPayAmt?.total)
  const adSales = adVal(ads?.summary?.orderPayAmt?.ad)
  const tiles = [
    ...(totalSales > 0 && adSales != null ? [{ tab: 'Temu insights', label: `Sales from ads (${DAYS} days)`, value: round1((adSales / totalSales) * 100), type: 'percent' }] : []),
    ...(ads?.summary?.spend?.ad ? [{ tab: 'Temu insights', label: `Ad spend (${DAYS} days)`, value: adMoney(ads.summary.spend.ad), type: 'money' }] : []),
    ...(per100(count(returnsRes)) != null ? [{ tab: 'Temu insights', label: 'Return requests per 100 orders', value: per100(count(returnsRes)), type: 'number' }] : []),
    ...(per100(count(cancelsRes)) != null ? [{ tab: 'Temu insights', label: 'Cancellations per 100 orders', value: per100(count(cancelsRes)), type: 'number' }] : []),
  ]
  return { summary: tiles, tables: list }
}

module.exports = analytics
