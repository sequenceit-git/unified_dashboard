const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const ACTIVITY = (id, joined) => ({ activityId: id, activityName: `Deal ${id}`, activityType: 1, activityStatus: 2, isJoinedActivity: joined, activityStartTime: 1764000000, activityEndTime: 1766000000 })
const CANDIDATES = { goodsList: [
  { goodsId: 77, isAllowedEnroll: true, recommendActivityQuantity: 30, skuList: [{ skuId: 1, recommendActivitySupplierPrice: 850 }, { skuId: 2, recommendActivitySupplierPrice: 900 }] },
  { goodsId: 88, isAllowedEnroll: true, recommendActivityQuantity: 10, skuList: [{ skuId: 5, recommendActivitySupplierPrice: 400 }] },
  { goodsId: 99, isAllowedEnroll: false, skuList: [] },
] }

function load(calls, { failFor = [] } = {}) {
  let draft = 0
  return stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.promotion.activity.query') return { activityList: body.onlyQueryJoinedActivity ? [ACTIVITY(500, true)] : [ACTIVITY(500, true), ACTIVITY(600, false)] }
        if (type === 'bg.promotion.activity.candidate.goods.query') return CANDIDATES
        if (type === 'bg.promotion.activity.goods.query') return { goodsList: [{ goodsId: 77, activityQuantity: 30, remainingActivityQuantity: 12, skuList: [{ skuId: 1, activitySupplierPrice: 850 }, { skuId: 2, activitySupplierPrice: 900 }] }] }
        if (type === 'bg.promotion.activity.goods.enroll') { draft += 1; return { draftId: draft, goodsId: body.enrollGoods.goodsId } }
        if (type === 'bg.promotion.activity.goods.operation.query') return body.draftIdList.map((id, i) => ({ draftId: id, operationStatus: 2, failReason: failFor.includes(i) ? 'Price above the activity limit' : '' }))
        throw new Error(`unexpected ${type}`)
      },
    },
  })
}

test('candidates come from Temu for that activity', async () => {
  const calls = []
  const restore = load(calls)
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const { tables } = await promotions('tok', {})
    const row = tables.find((t) => t.id === 'available').rows.find((r) => r.id === '600')
    const enrol = row.actions.find((a) => a.id === 'enrol')
    assert.deepEqual(enrol.input.options.map((o) => o.value), ['77', '88'])
    assert.equal(enrol.input.multiple, true)
    assert.ok(calls.some(([t, b]) => t === 'bg.promotion.activity.candidate.goods.query' && b.activityId === 600))
  } finally { restore() }
})

test('enrolled goods are listed', async () => {
  const restore = load([])
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const joined = (await promotions('tok', {})).tables.find((t) => t.id === 'joined').rows[0]
    assert.ok(joined.actions.some((a) => a.id === 'enrolled' && a.detail))
    const detail = await promotions.details.enrolled('tok', {}, '500')
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.goodsId, r.skus, r.quantity, r.remaining]), [['77', 2, 30, 12]])
  } finally { restore() }
})

test('partial enrol reports each refused goods', async () => {
  const calls = []
  const restore = load(calls, { failFor: [1] })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const res = await promotions.actions.enrol('tok', {}, '600', ['77', '88', '99'])
    const enrolls = calls.filter(([t]) => t === 'bg.promotion.activity.goods.enroll').map(([, b]) => b)
    assert.deepEqual(enrolls.map((b) => [b.activityId, b.enrollGoods.goodsId, b.enrollGoods.activityQuantity, b.enrollGoods.enrollSkuList]), [
      [600, 77, 30, [{ skuId: 1, activitySupplierPrice: 850 }, { skuId: 2, activitySupplierPrice: 900 }]],
      [600, 88, 10, [{ skuId: 5, activitySupplierPrice: 400 }]],
    ])
    assert.ok(enrolls.every((b) => b.enrollGoods.traceCode))
    assert.deepEqual(res.refused, [{ goodsId: '88', reason: 'Price above the activity limit' }, { goodsId: '99', reason: 'Temu does not allow this goods in the activity' }])
    assert.equal(res.message, 'Enrolled 1 goods. Not enrolled: 88 (Price above the activity limit), 99 (Temu does not allow this goods in the activity).')
    await assert.rejects(promotions.actions.enrol('tok', {}, '600', []), (e) => e.status === 400)
  } finally { restore() }
})
