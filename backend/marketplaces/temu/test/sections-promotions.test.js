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
    assert.equal(res.message, 'Submitted 1 goods to Temu. Not enrolled: 88 (Price above the activity limit), 99 (Temu does not allow this goods in the activity).')
    await assert.rejects(promotions.actions.enrol('tok', {}, '600', []), (e) => e.status === 400)
  } finally { restore() }
})

test('a Temu error on one goods is reported and the others still enrol', async () => {
  const calls = []
  let draft = 0
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.promotion.activity.candidate.goods.query') return CANDIDATES
        if (type === 'bg.promotion.activity.goods.enroll') {
          if (body.enrollGoods.goodsId === 77) throw Object.assign(new Error('parameter is illegal'), { code: 220010001 })
          draft += 1
          return { draftId: draft }
        }
        if (type === 'bg.promotion.activity.goods.operation.query') return body.draftIdList.map((id) => ({ draftId: id, operationStatus: 1 }))
        throw new Error(`unexpected ${type}`)
      },
    },
  })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const res = await promotions.actions.enrol('tok', {}, '600', ['77', '88'])
    assert.ok(calls.some(([t, b]) => t === 'bg.promotion.activity.goods.enroll' && b.enrollGoods.goodsId === 88), '88 is still tried')
    assert.deepEqual(res.refused, [{ goodsId: '77', reason: 'parameter is illegal' }])
    assert.equal(res.message, 'Submitted 1 goods to Temu. Not enrolled: 77 (parameter is illegal).')
  } finally { restore() }
})

test('candidates and enrolled goods are read across every page', async () => {
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        const page = body.pageNumber
        const goods = (from, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ goodsId: from + i, isAllowedEnroll: true, skuList: [], ...extra }))
        if (type === 'bg.promotion.activity.candidate.goods.query') return { total: 250, goodsList: page === 1 ? goods(1, 100) : page === 2 ? goods(101, 100) : goods(201, 50) }
        if (type === 'bg.promotion.activity.goods.query') return { total: 150, goodsList: page === 1 ? goods(1, 100, { activityQuantity: 1 }) : goods(101, 50, { activityQuantity: 1 }) }
        if (type === 'bg.promotion.activity.query') return { activityList: body.onlyQueryJoinedActivity ? [] : [ACTIVITY(600, false)] }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const row = (await promotions('tok', {})).tables.find((t) => t.id === 'available').rows[0]
    assert.equal(row.actions[0].input.options.length, 250)
    const detail = await promotions.details.enrolled('tok', {}, '500')
    assert.equal(detail.tables[0].rows.length, 150)
  } finally { restore() }
})

test('a page size Temu refuses as "parameter is illegal" is retried smaller', async () => {
  const sizes = []
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        if (type !== 'bg.promotion.activity.query') return { goodsList: [] }
        sizes.push(body.pageSize ?? 'none')
        if (body.pageSize > 20) throw Object.assign(new Error('parameter is illegal'), { code: 220010001 })
        return { activityList: body.onlyQueryJoinedActivity ? [ACTIVITY(500, true)] : [ACTIVITY(500, true), ACTIVITY(600, false)] }
      },
    },
  })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const { tables } = await promotions('tok', {})
    assert.equal(tables.find((t) => t.id === 'joined').rows.length, 1)
    assert.equal(tables.find((t) => t.id === 'available').rows.length, 2)
    assert.deepEqual([...new Set(sizes)], [50, 20])
  } finally { restore() }
})

test('when every size is refused, the table says so with what to check', async () => {
  const restore = stubModules({ '../service': { call: async () => { throw Object.assign(new Error('parameter is illegal'), { code: 220010001 }) } } })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const t = (await promotions('tok', {})).tables.find((x) => x.id === 'joined')
    assert.match(t.error, /parameter is illegal/)
    assert.match(t.error, /temu-probe/)
  } finally { restore() }
})

test('activities are asked with the activity type Temu US accepts (2)', async () => {
  const seen = []
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        if (type !== 'bg.promotion.activity.query') return { goodsList: [] }
        seen.push(body)
        // Live Temu US local: no type, or types 1, 3, 4 → 220010001; type 2 works.
        if (body.activityType !== 2) throw Object.assign(new Error('parameter is illegal'), { code: 220010001 })
        return { activityList: body.onlyQueryJoinedActivity ? [ACTIVITY(500, true)] : [ACTIVITY(500, true), ACTIVITY(600, false)] }
      },
    },
  })
  try {
    const promotions = freshRequire('marketplaces/temu/sections/promotions.js')
    const { tables } = await promotions('tok', {})
    assert.equal(tables.find((t) => t.id === 'available').rows.length, 2)
    assert.ok(seen.every((b) => b.activityType === 2))
  } finally { restore() }
})
