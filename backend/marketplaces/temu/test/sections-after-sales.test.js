const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const USD = (a) => ({ amount: a, currency: 'USD' })
function load(calls) {
  return stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.aftersales.parentaftersales.list.get') return { data: [{ parentAfterSalesSn: 'AS1', parentOrderSn: 'PO-1', afterSalesStatusGroup: 2, createAt: 1764000000 }] }
        if (type === 'bg.aftersales.cancel.list.get') return { data: [] }
        if (type === 'bg.aftersales.aftersales.list.get') return { data: [{ afterSalesSn: 'L1', parentAfterSalesSn: 'AS1', goodsId: 77, skuId: 1, applyAfterSalesGoodsNumber: 2, afterSalesStatus: 5, afterSalesType: 1 }] }
        if (type === 'temu.aftersales.parentaftersales.detail.get') return {
          parentAfterSalesSn: 'AS1', parentOrderSn: 'PO-1', parentAfterSalesStatus: 5, createAtMillis: 1764000000000, lastUpdateAtMillis: 1764100000000,
          refundSummary: { buyerTotalRefund: USD(18), discountFromSellerRefund: USD(2) },
          afterSalesList: [{ afterSalesSn: 'L1', afterSalesReasonDesc: 'Damaged', buyerComment: 'Cracked screen', applyRefundAmount: USD(18) }],
        }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
}

test('after-sales detail lists each line and its history', async () => {
  const calls = []
  const restore = load(calls)
  try {
    const afterSales = freshRequire('marketplaces/temu/sections/after-sales.js')
    const rows = (await afterSales('tok', {})).tables.find((t) => t.id === 'returns').rows
    assert.equal(rows[0].id, 'AS1|PO-1')
    assert.equal(rows[0].returnId, 'AS1')
    assert.deepEqual(rows[0].actions.map((a) => a.id), ['aftersales', 'return-address', 'return-label'])
    assert.deepEqual(rows[0].actions[0], { id: 'aftersales', label: 'Details', detail: true })
    const detail = await afterSales.details.aftersales('tok', {}, 'AS1|PO-1')
    assert.deepEqual(detail.tables.map((t) => t.id), ['lines', 'shipment', 'history'])
    assert.deepEqual([detail.tables[0].rows[0].line, detail.tables[0].rows[0].qty, detail.tables[0].rows[0].status, detail.tables[0].rows[0].reason, detail.tables[0].rows[0].refund.value], ['L1', 2, 'Refunded', 'Damaged: Cracked screen', 18])
    assert.ok(detail.tables.find((t) => t.id === 'history').rows.some((r) => r.what === 'Status' && r.value === 'Refunded'))
    assert.ok(detail.summary.some((s) => s.label === 'Refund to buyer' && s.value.value === 18))
    assert.deepEqual(calls.find(([t]) => t === 'bg.aftersales.aftersales.list.get')[1].parentAfterSalesSnList, ['AS1'])
    assert.deepEqual(calls.find(([t]) => t === 'temu.aftersales.parentaftersales.detail.get')[1].parentOrderSn, 'PO-1')
  } finally { restore() }
})

test('Temu detail and action routes only run the section file’s own names', async () => {
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('SECRET') },
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/sections.js')
    for (const actionId of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const ctx = { user: { role: 'super_admin' }, params: { sectionId: 'after-sales', actionId }, query: { id: '1' }, body: { id: '1' } }
      await assert.rejects(service.sectionDetail(ctx), (e) => e.status === 404, actionId)
      await assert.rejects(service.sectionAction(ctx), (e) => e.status === 404, actionId)
    }
    const sub = { user: { id: 'u2', role: 'sub_admin', allowedSections: ['temu:orders'] }, allowedShopIds: ['s1'], params: { sectionId: 'after-sales', actionId: 'aftersales' }, query: { id: 'AS1|PO-1' }, body: {} }
    await assert.rejects(service.sectionDetail(sub), (e) => e.status === 403)
  } finally { restore() }
})
