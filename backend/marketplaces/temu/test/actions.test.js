const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

process.env.TEMU_APP_KEY = process.env.TEMU_APP_KEY || 'k'
process.env.TEMU_APP_SECRET = process.env.TEMU_APP_SECRET || '12345678abcdefgh'

/** Loads the Temu service + sections with `temu.call` answering from `responses`. */
function load() {
  const calls = []
  const responses = {}
  const restore = stubModules({ '/cache': { claim: async () => true }, '/models/Listing': {}, '/models/Product': {} })
  const temu = freshRequire('marketplaces/temu/service.js')
  temu.call = async (type, params) => {
    calls.push({ type, params })
    const r = responses[type]
    if (r instanceof Error) throw r
    return typeof r === 'function' ? r(params) : (r ?? {})
  }
  // Temu's own section loaders (marketplaces/temu/sections/), by section id.
  const own = require('../sections')
  const sections = { load: (marketplace, id, token, shop) => own[id](token, shop) }
  const last = (type) => [...calls].reverse().find((c) => c.type === type)?.params
  return { temu, sections, calls, responses, last, restore }
}

test('ship confirms a self-fulfilled shipment with goodsId/skuId', async () => {
  const { temu, responses, last, restore } = load()
  try {
    responses['bg.logistics.companies.get'] = { shippingCompanyList: [{ shippingCompanyId: 998264743, shippingCompanyName: 'USPS' }] }
    responses['bg.logistics.warehouse.list.get'] = { warehouseList: [{ warehouseId: 'WH-1', defaultWarehouse: true }] }
    await temu.createShippingFulfillment('tok', 'PO-211-1', { carrier: 'usps', trackingNumber: '9400 1000-0000', lineItems: [{ lineItemId: '211-9', quantity: 2, externalListingId: '6023:3738' }] })
    assert.deepEqual(last('bg.logistics.shipment.v2.confirm'), {
      access_token: 'tok',
      sendType: 0,
      sendRequestList: [{ orderSendInfoList: [{ parentOrderSn: 'PO-211-1', orderSn: '211-9', quantity: 2, goodsId: 6023, skuId: 3738 }], carrierId: 998264743, trackingNumber: '940010000000', selfShippingWarehouseId: 'WH-1' }],
    })
    await assert.rejects(temu.createShippingFulfillment('tok', 'PO', { carrier: 'Pony Express', trackingNumber: '1', lineItems: [{ lineItemId: 'a', externalListingId: '1:2' }] }), /carrier/)
    await assert.rejects(temu.createShippingFulfillment('tok', 'PO', { carrier: 'usps', trackingNumber: '1', lineItems: [{ lineItemId: 'a' }] }), /item details/)
  } finally { restore() }
})

test('cancel uses the out-of-stock API and surfaces failure reasons', async () => {
  const { temu, responses, last, restore } = load()
  try {
    responses['temu.order.cancel.outofstock.apply'] = { applyResult: true }
    await temu.cancelOrder('tok', 'PO-1')
    assert.deepEqual(last('temu.order.cancel.outofstock.apply'), { access_token: 'tok', parentOrderSn: 'PO-1' })
    responses['temu.order.cancel.outofstock.apply'] = { applyResult: false, failReasonList: [{ reasonList: ['already shipped'] }] }
    await assert.rejects(temu.cancelOrder('tok', 'PO-1'), /already shipped/)
  } finally { restore() }
})

test('refund needs a pending after-sales request and is full only', async () => {
  const { temu, responses, last, restore } = load()
  try {
    responses['bg.aftersales.parentaftersales.list.get'] = { data: [{ parentAfterSalesSn: 'PA-5', parentAfterSalesStatus: 5 }, { parentAfterSalesSn: 'PA-1', parentAfterSalesStatus: 1 }] }
    await temu.issueRefund('tok', 'PO-1', { amount: 20, orderTotal: 20 })
    assert.deepEqual(last('temu.aftersales.refund.issue'), { access_token: 'tok', parentAfterSalesSn: 'PA-1', parentOrderSn: 'PO-1' })
    await assert.rejects(temu.issueRefund('tok', 'PO-1', { amount: 5, orderTotal: 20 }), /full refunds/)
    responses['bg.aftersales.parentaftersales.list.get'] = { data: [] }
    await assert.rejects(temu.issueRefund('tok', 'PO-1', {}), /refund or return request/)
  } finally { restore() }
})

test('return and cancellation decisions: approve only', async () => {
  const { temu, last, restore } = load()
  try {
    await temu.decideReturn('tok', 'PA-7', { decision: 'APPROVE', orderId: 'PO-7' })
    assert.deepEqual(last('temu.aftersales.refund.issue'), { access_token: 'tok', parentAfterSalesSn: 'PA-7', parentOrderSn: 'PO-7' })
    await assert.rejects(temu.decideReturn('tok', 'PA-7', { decision: 'DECLINE' }), /Seller Center/)
    await temu.decideCancellation('tok', 'PA-8', { action: 'approve', orderId: 'PO-8' })
    assert.deepEqual(last('bg.aftersales.cancel.agree'), { access_token: 'tok', parentAfterSalesSn: 'PA-8', parentOrderSn: 'PO-8' })
    await assert.rejects(temu.decideCancellation('tok', 'PA-8', { action: 'reject' }), /Seller Center/)
  } finally { restore() }
})

test('getOrders fills address for to-ship orders and totals when missing', async () => {
  const { temu, responses, calls, restore } = load()
  try {
    responses['bg.order.list.v2.get'] = { pageItems: [
      { parentOrderMap: { parentOrderSn: 'PO-A', parentOrderStatus: 2, parentOrderTime: 1700000000 }, orderList: [{ orderSn: '211-A', goodsId: 1, skuId: 2, quantity: 1, goodsName: 'Mug' }] },
      { parentOrderMap: { parentOrderSn: 'PO-B', parentOrderStatus: 4, parentOrderTime: 1700000000, amount: 12.5 }, orderList: [] },
    ] }
    responses['bg.order.shippinginfo.v2.get'] = { receiptName: 'Jo Buyer', mobile: '555', addressLine1: '1 Main St', addressLine2: 'Apt 2', regionName1: 'US', regionName2: 'CA', regionName3: 'LA', postCode: '90001' }
    responses['bg.order.amount.query'] = { parentOrderMap: { customerPaid: { amount: '19.99', currency: 'USD' } }, orderList: [{ orderSn: '211-A', unitRetailPrice: { amount: '19.99', currency: 'USD' } }] }
    const { orders } = await temu.getOrders('tok', { limit: 10 })
    const a = orders.find((o) => o.externalOrderId === 'PO-A')
    assert.deepEqual(a.shippingAddress, { street: '1 Main St, Apt 2', city: 'LA', state: 'CA', zip: '90001', country: 'US' })
    assert.equal(a.buyer.name, 'Jo Buyer')
    assert.equal(a.totals.total, 19.99)
    assert.equal(a.items[0].unitPrice, 19.99)
    assert.equal(a.items[0].externalListingId, '1:2')
    const b = orders.find((o) => o.externalOrderId === 'PO-B')
    assert.equal(b.totals.total, 12.5)
    assert.equal(b.shippingAddress, undefined)
    assert.equal(calls.filter((c) => c.type === 'bg.order.shippinginfo.v2.get').length, 1)
    assert.equal(calls.filter((c) => c.type === 'bg.order.amount.query').length, 1)
  } finally { restore() }
})

test('sections: promotions, ads (seconds fallback) and returns with cancellations', async () => {
  const { sections, responses, restore } = load()
  try {
    responses['bg.promotion.activity.query'] = (p) => ({ activityList: p.onlyQueryJoinedActivity ? [{ activityId: 1, activityName: 'Lightning', activityStatus: 'ONGOING', isJoinedActivity: true, activityStartTime: 1700000000000 }] : [{ activityId: 1, isJoinedActivity: true }, { activityId: 2, activityName: 'Fall sale' }] })
    let s = await sections.load('temu', 'promotions', 'tok')
    assert.equal(s.tables[0].rows[0].name, 'Lightning')
    assert.equal(s.summary[1].value, 1)

    responses['temu.searchrec.ad.reports.mall.query'] = (p) => {
      if (p.startTs > 1e12) { const e = new Error('bad query params'); e.code = 230012000; throw e }
      return { reportsSummary: { adSpendAll: { val: 10 }, orderPayAmtAll: { val: 40 }, roasAll: { val: 4 }, orderPayCntAll: { val: 3 } }, reportsItemList: [{ goodsId: 9, adSpend: { val: 10 }, orderPayAmt: { val: 40 }, roas: { val: 4 }, imprCnt: { val: 100 }, clkCnt: { val: 5 }, orderPayCnt: { val: 3 } }] }
    }
    s = await sections.load('temu', 'ads', 'tok')
    assert.equal(s.tables[0].error, undefined)
    assert.equal(s.tables[0].rows[0].spend.value, 10)
    assert.equal(s.summary[2].value, 4)

    responses['bg.aftersales.parentaftersales.list.get'] = { data: [] }
    responses['bg.aftersales.cancel.list.get'] = { data: [{ parentAfterSalesSn: 'PA-C', parentAfterSalesStatus: 1, afterSalesInfoList: [{ parentOrderSn: 'PO-C', applyGoodsNumber: 2, createAtMillis: 1700000000000 }] }] }
    s = await sections.load('temu', 'returns', 'tok')
    assert.deepEqual(s.tables[1].rows[0], { cancelId: 'PA-C', orderId: 'PO-C', status: 'Pending', items: 2, opened: new Date(1700000000000).toISOString() })
    assert.equal(s.summary[2].value, 1)
  } finally { restore() }
})
