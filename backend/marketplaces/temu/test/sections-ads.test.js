const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const m = (ad) => ({ total: { val: ad * 2 }, ad: { val: ad } })
const goodsReport = (id, spend, sales) => ({ goodsInfo: { goodsId: id }, reportInfo: { summary: { spend: m(spend), orderPayAmt: m(sales), roas: m(sales / spend), imprCnt: m(1000), clkCnt: m(50), ctr: m(0.05), cartCnt: m(8), orderPayCnt: m(4) } } })

function load(mall, calls) {
  return stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'temu.searchrec.ad.reports.mall.query') return mall
        if (type === 'temu.searchrec.ad.reports.goods.query') return goodsReport(body.goodsId, body.goodsId === 77 ? 10 : 40, body.goodsId === 77 ? 50 : 60)
        throw new Error(`unexpected ${type}`)
      },
    },
  })
}

test('the product report shows spend and ROAS per goods', async () => {
  const calls = []
  const restore = load({ reportsItemList: [{ goodsId: 77, adSpend: { val: 10 } }, { goodsId: 88, adSpend: { val: 40 } }], reportsSummary: { adSpendAll: { val: 50 } } }, calls)
  try {
    const ads = freshRequire('marketplaces/temu/sections/ads.js')
    const { tables } = await ads('tok', {})
    assert.deepEqual(tables.map((t) => [t.id, t.tab]), [['goods', 'Overview'], ['goodsReport', 'By product']])
    const rows = tables[1].rows
    assert.deepEqual(rows.map((r) => [r.goodsId, r.spend.value, r.sales.value, r.roas, r.impressions, r.clicks, r.ctr, r.carts, r.orders]), [
      ['88', 40, 60, 1.5, 1000, 50, 5, 8, 4], ['77', 10, 50, 5, 1000, 50, 5, 8, 4],
    ])
    const g = calls.filter(([t]) => t === 'temu.searchrec.ad.reports.goods.query')
    assert.deepEqual(g.map(([, b]) => b.goodsId).sort(), [77, 88])
    const mall = calls.find(([t]) => t === 'temu.searchrec.ad.reports.mall.query')[1]
    assert.deepEqual([g[0][1].startTs, g[0][1].endTs], [mall.startTs, mall.endTs])
  } finally { restore() }
})

test('no ads means an empty report', async () => {
  const calls = []
  const restore = load({ reportsItemList: [] }, calls)
  try {
    const ads = freshRequire('marketplaces/temu/sections/ads.js')
    const report = (await ads('tok', {})).tables.find((t) => t.id === 'goodsReport')
    assert.equal(report.error, undefined)
    assert.deepEqual(report.rows, [])
    assert.ok(!calls.some(([t]) => t === 'temu.searchrec.ad.reports.goods.query'))
  } finally { restore() }
})

test('one failing product leaves the others in the product report', async () => {
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        if (type === 'temu.searchrec.ad.reports.mall.query') return { reportsItemList: [{ goodsId: 77, adSpend: { val: 10 } }, { goodsId: 88, adSpend: { val: 40 } }] }
        if (body.goodsId === 88) throw new Error('rate limited')
        return goodsReport(77, 10, 50)
      },
    },
  })
  try {
    const ads = freshRequire('marketplaces/temu/sections/ads.js')
    const report = (await ads('tok', {})).tables.find((t) => t.id === 'goodsReport')
    assert.equal(report.error, undefined)
    assert.deepEqual(report.rows.map((r) => r.goodsId), ['77'])
    assert.match(report.note, /1 product could not be read/)
  } finally { restore() }
})
