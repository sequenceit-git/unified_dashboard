const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

function load(replies, calls = [], { listings = [], products = [] } = {}) {
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        const r = replies[type]
        if (r === undefined) throw new Error(`unexpected ${type}`)
        return typeof r === 'function' ? r(body) : r
      },
    },
    '/models/Listing': modelStub(() => listings),
    '/models/Product': modelStub(() => products),
  })
  return { ads: freshRequire('marketplaces/temu/sections/ads.js'), restore, calls }
}

test("eligible goods come with Temu's predicted ROAS", async () => {
  const { ads, restore, calls } = load({
    'temu.searchrec.ad.goods.create.query': { goodsInfoList: [{ goodsId: 77, grayReason: [] }, { goodsId: 88, grayReason: [{ reason: 'Goods has no sales history' }] }] },
    'temu.searchrec.ad.roas.pred': { queryAdBidResult: [{ goodsId: 77, predList: [{ roas: '4.5' }, { roas: '6' }] }] },
  })
  try {
    const res = await ads.eligibility('tok', ['77', '88'])
    assert.deepEqual(res, { eligible: [{ goodsId: '77', roas: 4.5 }], refused: [{ goodsId: '88', reason: 'Goods has no sales history' }] })
    assert.deepEqual(calls[1][1], { access_token: 'tok', goodsInfoList: [{ goodsId: 77 }] })
  } finally { restore() }
})

test("creating ads for three goods reports the one Temu refuses", async () => {
  const { ads, restore, calls } = load({
    'temu.searchrec.ad.goods.create.query': (b) => ({ goodsInfoList: [{ goodsId: 1 }, { goodsId: 2 }, { goodsId: 3, grayReason: [{ reason: 'Not eligible' }] }].filter((g) => b.goodsIdList.includes(g.goodsId)) }),
    'temu.searchrec.ad.roas.pred': { queryAdBidResult: [{ goodsId: 1, predList: [{ roas: '5' }] }, { goodsId: 2, predList: [] }] },
    'temu.searchrec.ad.create': { successGoodsIdLists: [1], createGoodsFailObjList: [{ goodsId: 2, success: false, reason: 'ROAS too low' }] },
  })
  try {
    const res = await ads.actions['create-ad']('tok', {}, 'goods', { goods: ['1', '2', '3'], budget: '20', roas: '' })
    const create = calls.find(([t]) => t === 'temu.searchrec.ad.create')[1]
    // Goods 2 has no prediction and no typed ROAS: refused before Temu; goods 3 is not eligible.
    assert.deepEqual(create, { access_token: 'tok', createAdReqs: [{ goodsId: 1, budget: 20, roas: 5 }] })
    assert.deepEqual(res.refused.map((r) => r.goodsId).sort(), ['2', '3'])
    assert.match(res.message, /^Created 1 ad\./)
    const typed = await ads.actions['create-ad']('tok', {}, 'goods', { goods: ['1'], budget: '15', roas: '3.25' })
    assert.deepEqual(calls.filter(([t]) => t === 'temu.searchrec.ad.create').at(-1)[1].createAdReqs, [{ goodsId: 1, budget: 15, roas: 3.25 }])
    void typed
    for (const bad of [{ goods: ['1'], budget: '0' }, { goods: [], budget: '10' }, { goods: ['1'], budget: '10', roas: '-1' }]) await assert.rejects(ads.actions['create-ad']('tok', {}, 'goods', bad), (e) => e.status === 400)
  } finally { restore() }
})

test("an ad's budget and target ROAS can be changed", async () => {
  const { ads, restore, calls } = load({ 'temu.searchrec.ad.modify': { modifyGoodsRespList: [{ goodsId: 77, success: true }] } })
  try {
    await ads.actions['edit-ad']('tok', {}, '77', { budget: '30', roas: '4' })
    assert.deepEqual(calls[0][1], { access_token: 'tok', modifyAdDTO: { goodsId: 77, budget: 30, roas: 4 } })
    const failing = load({ 'temu.searchrec.ad.modify': { modifyGoodsRespList: [{ goodsId: 77, success: false, reason: 'Budget below minimum' }] } })
    try {
      await assert.rejects(failing.ads.actions['edit-ad']('tok', {}, '77', { budget: '1' }), /Budget below minimum/)
    } finally { failing.restore() }
  } finally { restore() }
})

test("an ad's details and change log are listed newest first", async () => {
  const { ads, restore, calls } = load({
    'temu.searchrec.ad.detail.query': { adsDetail: [{ goodsId: 77, budget: 20, roas: 4, summary: { spend: { ad: { val: 12.5 } }, orderPayAmt: { ad: { val: 60 } } } }] },
    'temu.searchrec.ad.log.query': { result: [{ eventType: 'MODIFY', changeInfo: 'Budget 10 → 20', updatedAt: '1764000000000', updateSellerName: 'ann' }, { eventType: 'CREATE', changeInfo: 'Created', updatedAt: '1763000000000' }] },
  })
  try {
    const d = await ads.details.ad('tok', {}, '77')
    assert.deepEqual(d.summary.map((s) => [s.label, s.value?.value ?? s.value]), [['Daily budget', 20], ['Target ROAS', 4], ['Spend (30 days)', 12.5], ['Ad sales (30 days)', 60]])
    assert.deepEqual(d.tables[0].rows.map((r) => r.what), ['Budget 10 → 20', 'Created'])
    assert.deepEqual(calls[0][1], { access_token: 'tok', goodsList: [77] })
  } finally { restore() }
})

test('ad rows offer edit and details; the table offers new ads for listed goods not yet advertised', async () => {
  const { ads, restore } = load({
    'temu.searchrec.ad.reports.mall.query': { reportsItemList: [{ goodsId: 77, adSpend: { val: 10 } }] },
    'temu.searchrec.ad.reports.goods.query': { reportsItemList: [] },
  }, [], { listings: [{ externalListingId: '77:1', productId: 'p1' }, { externalListingId: '88:5', productId: 'p2' }], products: [{ _id: 'p1', title: 'Mug' }, { _id: 'p2', title: 'Cup' }] })
  try {
    const { tables } = await ads('tok', { _id: 's1' })
    const t = tables.find((x) => x.id === 'goods')
    assert.deepEqual(t.rows[0].actions.map((a) => a.id), ['ad', 'edit-ad'])
    const create = t.actions.find((a) => a.id === 'create-ad')
    assert.deepEqual(create.input.fields.find((f) => f.name === 'goods').options, [{ value: '88', label: 'Cup (88)' }])
  } finally { restore() }
})
