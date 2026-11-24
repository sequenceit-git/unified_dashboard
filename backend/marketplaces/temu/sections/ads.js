/**
 * Temu "ads" section: the shop's ad report (overview, by goods), then a deeper report per product
 * (impressions to ROAS, ad-only figures) for the goods with the most ad spend.
 */
const temu = require('../service')
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { adVal, adMoney, temuAdReport, allowedMethod } = require('./helpers')
const Listing = require('../../../models/Listing')
const Product = require('../../../models/Product')

const TOP_GOODS = 20
const DAY = 86400000
const bad = (error) => Object.assign(new Error(error), { status: 400, body: { error } })

/** The shop's listed Temu goods: `[{ goodsId, title }]` (one per goods). */
async function shopGoods(shop) {
  const listings = await Listing.find({ shopId: shop?._id, marketplace: 'temu' }).select('externalListingId productId').lean()
  const titles = new Map((await Product.find({ _id: { $in: listings.map((l) => l.productId) } }).select('title').lean()).map((p) => [String(p._id), p.title]))
  const byGoods = new Map()
  for (const l of listings) {
    const goodsId = String(l.externalListingId || '').split(':')[0]
    if (/^\d+$/.test(goodsId) && !byGoods.has(goodsId)) byGoods.set(goodsId, titles.get(String(l.productId)) || '')
  }
  return [...byGoods].map(([goodsId, title]) => ({ goodsId, title }))
}

/** Temu's eligibility check (required before creating ads) and its predicted ROAS for each eligible goods. */
async function eligibility(token, goodsIds) {
  const res = await temu.call('temu.searchrec.ad.goods.create.query', { access_token: token, goodsIdList: goodsIds.map(Number) })
  const refused = []
  const ok = []
  for (const g of res.goodsInfoList || []) {
    const reason = (g.grayReason || []).map((r) => r.reason).filter(Boolean).join('; ')
    if (reason) refused.push({ goodsId: String(g.goodsId), reason })
    else ok.push(String(g.goodsId))
  }
  const preds = ok.length ? await temu.call('temu.searchrec.ad.roas.pred', { access_token: token, goodsInfoList: ok.map((goodsId) => ({ goodsId: Number(goodsId) })) }) : { queryAdBidResult: [] }
  const roas = new Map((preds.queryAdBidResult || []).map((p) => [String(p.goodsId), adVal(p.predList?.[0]?.roas)]))
  return { eligible: ok.map((goodsId) => ({ goodsId, roas: roas.get(goodsId) ?? null })), refused }
}
const positive = (v) => v !== undefined && v !== null && String(v).trim() !== '' && Number(v) > 0

async function ads(token, shop) {
  // Temu Ads not allowed for this connection: say so, without calling Temu.
  if (!allowedMethod(shop, 'temu.searchrec.ad.reports.mall.query')) return { adsOff: true, summary: [], tables: [] }
  const shopList = await shopGoods(shop).catch(() => [])
  const titles = new Map(shopList.map((g) => [g.goodsId, g.title]))
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
          title: titles.get(String(row.goodsId)) || '',
          spend: adMoney(row.adSpend),
          sales: adMoney(row.orderPayAmt),
          orders: adVal(row.orderPayCnt),
          roas: adVal(row.roas),
          impressions: adVal(row.imprCnt),
          clicks: adVal(row.clkCnt),
          id: String(row.goodsId),
          actions: [{ id: 'ad', label: 'Details', detail: true }, { id: 'edit-ad', label: 'Budget & ROAS', input: { fields: [
            { name: 'budget', label: 'Daily budget (USD)', type: 'number' },
            { name: 'roas', label: 'Target ROAS', type: 'number' },
          ] } }],
        }))
      },
    },
  ])
  const advertised = new Set(list[0].rows.map((r) => String(r.goodsId)))
  const goods = shopList.filter((g) => !advertised.has(g.goodsId))
  if (goods.length) {
    list[0].actions = [{ id: 'create-ad', label: '+ New ads', input: { fields: [
      { name: 'goods', label: 'Goods to advertise', options: goods.map((g) => ({ value: g.goodsId, label: `${g.title || 'Goods'} (${g.goodsId})` })), multiple: true },
      { name: 'budget', label: 'Daily budget per goods (USD)', type: 'number' },
      { name: 'roas', label: "Target ROAS (empty: Temu's suggestion)", type: 'number' },
    ] } }]
  }
  // Per-product reports for the goods with the most spend, over the same period as the shop report.
  let unreadable = 0
  const [byProduct] = await tables([{
    id: 'goodsReport',
    tab: 'By product',
    title: `Results per product (top ${TOP_GOODS} by spend, last 30 days)`,
    note: 'Ad-only figures from Temu for each product: from impressions to orders, spend and return on ad spend.',
    columns: [col('goodsId', 'Goods'), col('impressions', 'Impressions', 'number'), col('clicks', 'Clicks', 'number'), col('ctr', 'CTR %', 'number'), col('carts', 'Add to cart', 'number'), col('orders', 'Orders', 'number'), col('sales', 'Ad sales', 'money'), col('spend', 'Spend', 'money'), col('roas', 'ROAS', 'number')],
    load: async () => {
      const top = [...(report?.reportsItemList || [])].sort((a, b) => (adVal(b.adSpend) || 0) - (adVal(a.adSpend) || 0)).slice(0, TOP_GOODS)
      if (!top.length || period.startTs == null) return []
      const settled = await Promise.allSettled(top.map(async (item) => {
        const res = await temu.call('temu.searchrec.ad.reports.goods.query', { access_token: token, goodsId: Number(item.goodsId), startTs: period.startTs, endTs: period.endTs })
        const s = res?.reportInfo?.summary || {}
        const ad = (key) => adVal(s[key]?.ad)
        const ctr = ad('ctr')
        return {
          goodsId: String(item.goodsId),
          title: titles.get(String(item.goodsId)) || '',
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
      const rows = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      unreadable = settled.length - rows.length
      return rows.sort((a, b) => (b.spend?.value || 0) - (a.spend?.value || 0))
    },
  }])
  if (unreadable) byProduct.note = `${byProduct.note} ${unreadable} product${unreadable === 1 ? '' : 's'} could not be read from Temu this time.`
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

/** Read-only drill-downs. */
ads.details = {
  /**
   * For the New ads review: which of the goods (comma list, up to 50) Temu lets advertise, with
   * its predicted ROAS, and why the others can't. Read only: nothing is created.
   */
  eligibility: async (token, shop, id) => {
    const goods = [...new Set(String(id).split(',').map((g) => g.trim()).filter((g) => /^\d+$/.test(g)))].slice(0, 50)
    if (!goods.length) throw bad('Choose at least one goods.')
    return eligibility(token, goods)
  },
  /** An ad: its budget, target ROAS and 30-day results, and its change log. */
  ad: async (token, shop, id) => {
    const goodsId = Number(id)
    if (!Number.isInteger(goodsId)) throw bad('Unknown goods')
    const end = Date.now()
    const [detail, log] = await Promise.all([
      temu.call('temu.searchrec.ad.detail.query', { access_token: token, goodsList: [goodsId] }),
      temu.call('temu.searchrec.ad.log.query', { access_token: token, goodsId, startTime: end - 30 * DAY, endTime: end }).catch(() => ({ result: [] })),
    ])
    const ad = (detail.adsDetail || []).find((a) => String(a.goodsId) === String(goodsId)) || (detail.adsDetail || [])[0] || {}
    const s = ad.summary || {}
    return {
      title: `Ad for goods ${goodsId}`,
      summary: [
        { label: 'Daily budget', value: adMoney(ad.budget), type: 'money' },
        { label: 'Target ROAS', value: adVal(ad.roas), type: 'number' },
        { label: 'Spend (30 days)', value: adMoney(s.spend?.ad), type: 'money' },
        { label: 'Ad sales (30 days)', value: adMoney(s.orderPayAmt?.ad), type: 'money' },
      ],
      tables: [{
        id: 'log',
        title: 'Changes',
        columns: [col('when', 'When', 'date'), col('what', 'Change'), col('who', 'By'), col('type', 'Type')],
        rows: (log.result || []).map((l) => ({ when: l.updatedAt ? new Date(Number(l.updatedAt)).toISOString() : null, what: l.changeInfo || '', who: l.updateSellerName || '', type: l.eventType || '' }))
          .sort((a, b) => String(b.when).localeCompare(String(a.when))),
      }],
    }
  },
}

/** Row and table actions. */
ads.actions = {
  /** New ads: Temu's eligibility check first, then one request with each goods' budget and ROAS (typed, or Temu's prediction). */
  'create-ad': async (token, shop, id, value = {}) => {
    const goods = [...new Set((Array.isArray(value.goods) ? value.goods : []).map(String).filter((g) => /^\d+$/.test(g)))]
    if (!goods.length) throw bad('Choose at least one goods.')
    if (!positive(value.budget)) throw bad('Enter a daily budget above 0.')
    const typed = String(value.roas ?? '').trim()
    if (typed && !positive(typed)) throw bad('A target ROAS is above 0.')
    const budget = Math.round(Number(value.budget) * 100) / 100
    const { eligible, refused } = await eligibility(token, goods)
    const reqs = []
    for (const g of eligible) {
      const roas = typed ? Math.round(Number(typed) * 100) / 100 : g.roas
      if (roas == null) refused.push({ goodsId: g.goodsId, reason: 'Temu has no ROAS suggestion: enter a target ROAS' })
      else reqs.push({ goodsId: Number(g.goodsId), budget, roas })
    }
    let created = 0
    if (reqs.length) {
      const res = await temu.call('temu.searchrec.ad.create', { access_token: token, createAdReqs: reqs })
      for (const f of res.createGoodsFailObjList || []) {
        if (f.success === false && !refused.some((r) => r.goodsId === String(f.goodsId))) refused.push({ goodsId: String(f.goodsId), reason: f.reason || 'Temu refused it' })
      }
      created = (res.successGoodsIdLists || []).length
    }
    const listed = refused.length ? ` Not created: ${refused.map((r) => `${r.goodsId} (${r.reason})`).join(', ')}.` : ''
    return { message: `Created ${created} ad${created === 1 ? '' : 's'}.${listed}`, refused }
  },
  /** Budget and/or target ROAS of one goods' ad. */
  'edit-ad': async (token, shop, id, value = {}) => {
    const goodsId = Number(id)
    if (!Number.isInteger(goodsId)) throw bad('Unknown goods')
    const dto = { goodsId }
    if (String(value.budget ?? '').trim()) { if (!positive(value.budget)) throw bad('Enter a daily budget above 0.'); dto.budget = Math.round(Number(value.budget) * 100) / 100 }
    if (String(value.roas ?? '').trim()) { if (!positive(value.roas)) throw bad('A target ROAS is above 0.'); dto.roas = Math.round(Number(value.roas) * 100) / 100 }
    if (Object.keys(dto).length === 1) throw bad('Enter a budget or a target ROAS.')
    const res = await temu.call('temu.searchrec.ad.modify', { access_token: token, modifyAdDTO: dto })
    const fail = (res.modifyGoodsRespList || []).find((r) => r.success === false)
    if (fail) throw bad(fail.reason || 'Temu did not change this ad.')
    return { message: `Ad for goods ${goodsId} updated.` }
  },
}

ads.eligibility = eligibility

module.exports = ads
