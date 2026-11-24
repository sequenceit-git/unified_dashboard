const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const USD = (v) => ({ value: String(v), currency: 'USD' })
const GETS = {
  '/post-order/v2/return/search': { members: [
    { returnId: 'R1', orderId: 'O1', status: 'ITEM_SHIPPED', state: 'ITEM_SHIPPED', sellerTotalRefund: { estimatedRefundAmount: USD(20) } },
    { returnId: 'R2', orderId: 'O2', status: 'CLOSED', state: 'CLOSED' },
  ] },
  '/post-order/v2/cancellation/search': { cancellations: [] },
  '/post-order/v2/casemanagement/search': { members: [{ caseId: 7, itemId: 9, buyer: 'bob', caseStatusEnum: 'OPEN', claimAmount: USD(30) }] },
  '/post-order/v2/inquiry/search': { members: [{ inquiryId: 5, itemId: 9, buyer: 'ann', inquiryStatusEnum: 'OPEN', claimAmount: USD(12) }] },
  '/sell/fulfillment/v1/payment_dispute_summary': { paymentDisputeSummaries: [
    { paymentDisputeId: 'D1', orderId: 'O3', reason: 'ITEM_NOT_RECEIVED', paymentDisputeStatus: 'ACTION_NEEDED', amount: USD(40), buyerUsername: 'cy' },
    { paymentDisputeId: 'D2', orderId: 'O4', paymentDisputeStatus: 'CLOSED', amount: USD(10) },
  ] },
}

function loadSection() {
  const restore = stubModules({
    './helpers': {
      scopeAware: require('../sections/helpers').scopeAware,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url) => {
        const key = Object.keys(GETS).find((k) => url.includes(k))
        if (!key) throw new Error(`unexpected ${url}`)
        return GETS[key]
      },
    },
  })
  return { section: freshRequire('marketplaces/ebay/sections/returns-cases.js'), restore }
}

test('open inquiries and cases are listed', async () => {
  const { section, restore } = loadSection()
  try {
    const { tables } = await section('tok')
    const inq = tables.find((t) => t.id === 'inquiries')
    assert.equal(inq.tab, 'Inquiries')
    assert.equal(inq.rows[0].id, '5')
    assert.deepEqual(inq.rows[0].actions.map((a) => a.id), ['inquiry-refund', 'inquiry-tracking'])
    const cases = tables.find((t) => t.id === 'cases')
    assert.equal(cases.tab, 'Cases')
    assert.equal(cases.rows[0].caseId, '7')
    const returns = tables.find((t) => t.id === 'returns')
    assert.equal(returns.tab, 'Returns')
    assert.deepEqual(returns.rows[0].actions.map((a) => a.id), ['mark-received', 'refund'])
    assert.deepEqual(returns.rows[1].actions, [])
  } finally { restore() }
})

test('dispute rows offer Accept only while open', async () => {
  const { section, restore } = loadSection()
  try {
    const disputes = (await section('tok')).tables.find((t) => t.id === 'disputes')
    assert.equal(disputes.tab, 'Payment disputes')
    assert.deepEqual(disputes.rows.map((r) => [r.id, r.actions.map((a) => a.id)]), [['D1', ['dispute-accept']], ['D2', []]])
    assert.ok(disputes.rows[0].actions[0].confirm)
  } finally { restore() }
})

test('each action calls its endpoint', async () => {
  const { ACTIONS } = require('../sections/returnsActions')
  const cases = [
    ['mark-received', 'R1', undefined, [['POST', '/post-order/v2/return/R1/mark_as_received']]],
    ['refund', 'R1', undefined, [['GET', '/post-order/v2/return/R1'], ['POST', '/post-order/v2/return/R1/issue_refund']]],
    ['inquiry-refund', '5', undefined, [['POST', '/post-order/v2/inquiry/5/issue_refund']]],
    ['inquiry-tracking', '5', { trackingNumber: '1Z9', carrier: 'UPS' }, [['POST', '/post-order/v2/inquiry/5/provide_shipment_info']]],
    ['dispute-accept', 'D1', undefined, [['GET', 'https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute/D1'], ['POST', 'https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute/D1/accept']]],
  ]
  for (const [id, target, value, expected] of cases) {
    const calls = []
    const client = {
      postOrder: async (token, path, { method = 'GET', body } = {}) => { calls.push([method, path, body]); return method === 'GET' ? { summary: { sellerTotalRefund: { estimatedRefundAmount: USD(20) } } } : {} },
      ebaySend: async (token, method, url, body) => { calls.push([method, url, body]); return method === 'GET' ? { revision: 3 } : {} },
      apiz: 'https://apiz.ebay.com',
    }
    const result = await ACTIONS[id].run(client, 'tok', target, value)
    assert.deepEqual(calls.map(([m, p]) => [m, p]), expected, id)
    assert.ok(result.message, id)
    if (id === 'refund') assert.equal(calls[1][2].refundDetail.totalAmount.value, 20)
    if (id === 'inquiry-tracking') assert.deepEqual([calls[0][2].trackingNumber, calls[0][2].shippingCarrierName], ['1Z9', 'UPS'])
    if (id === 'dispute-accept') assert.equal(calls[1][2].revision, 3)
  }
})

test('adding tracking without a tracking number is refused before calling eBay', async () => {
  const { ACTIONS } = require('../sections/returnsActions')
  const calls = []
  const client = { postOrder: async (...a) => { calls.push(a); return {} }, ebaySend: async () => ({}), apiz: '' }
  await assert.rejects(ACTIONS['inquiry-tracking'].run(client, 'tok', '5', { trackingNumber: ' ', carrier: 'UPS' }), (e) => e.status === 400)
  assert.equal(calls.length, 0)
})

test('dispute accept needs the returns-cases section', async () => {
  let called = false
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'ebay', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    'sections/returnsActions': { ACTIONS: { 'dispute-accept': { run: async () => { called = true; return { message: 'ok' } } } } },
  })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    const sub = { user: { id: 'u2', role: 'sub_admin', allowedSections: ['ebay:orders'] }, allowedShopIds: ['s1'], params: { actionId: 'dispute-accept' }, body: { id: 'D1' }, query: {} }
    await assert.rejects(service.caseAction(sub), (e) => e.status === 403)
    assert.equal(called, false)
    const admin = { user: { id: 'u1', role: 'super_admin' }, params: { actionId: 'dispute-accept' }, body: { id: 'D1' }, query: {} }
    assert.deepEqual(await service.caseAction(admin), { message: 'ok' })
    await assert.rejects(service.caseAction({ ...admin, params: { actionId: 'nope' } }), (e) => e.status === 404)
  } finally { restore() }
})
