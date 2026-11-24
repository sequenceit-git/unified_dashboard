const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

function load({ decided = [] } = {}) {
  const calls = []
  const store = new Map()
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttPost: async (token, shop, path, query, body) => {
        calls.push(['POST', path, query, body])
        if (path.endsWith('/returns/search')) return { return_orders: [
          {
            return_id: 'R1',
            order_id: 'O1',
            return_type: 'REFUND',
            return_status: 'RETURN_OR_REFUND_REQUEST_PENDING',
            return_reason: 'DAMAGED',
            refund_amount: { refund_total: '12.50', currency: 'USD' },
            return_line_items: [{ order_line_item_id: 'LI1', sku_id: 'SKU1', quantity: 1 }],
          },
          { return_id: 'R2', order_id: 'O2', return_type: 'REFUND', return_status: 'REFUND_SUCCESS' },
        ] }
        if (path.endsWith('/cancellations/search')) return { cancellations: [] }
        if (path === '/return_refund/202603/aftersales/search') return { aftersale_orders: [
          { aftersale_id: 'AS1', order_id: 'O1', aftersale_type: 'RETURN_AND_REFUND', aftersale_status: 'PENDING', refund_amount: { refund_total: '12.50', currency: 'USD' }, create_time: 1764000000 },
        ] }
        if (path === '/return_refund/202604/rma/search') return { rmas: [
          { rma_id: 'RMA1', return_id: 'R1', order_id: 'O1', rma_status: 'OPEN', tracking_number: '1Z999', create_time: 1764000100 },
        ] }
        if (path.endsWith('/refunds/calculate')) return {
          order_refund_amount: { refund_total: '12.50', refund_subtotal: '11.00', refund_tax: '1.50', currency: 'USD' },
        }
        if (path === '/return_refund/202405/returns/shipping_documents') return { ok: true }
        throw new Error(`unexpected ${path}`)
      },
      ttGet: async (token, shop, path, query) => {
        calls.push(['GET', path, query])
        if (path === '/return_refund/202309/reject_reasons') return { reasons: [{ name: 'seller_reject_apply_product_has_been_used', text: 'Item was used' }, { name: 'seller_reject_apply_wrong_item', text: 'Wrong item returned' }] }
        if (path === '/return_refund/202309/returns/R1/records') return { records: [
          { event: 'BUYER_REQUEST', role: 'BUYER', description: 'Buyer asked for a refund', reason_text: 'Damaged', create_time: 1764000000 },
          { event: 'SELLER_REVIEW', role: 'SELLER', description: 'Waiting for seller', create_time: 1764000600 },
        ] }
        if (path === '/return_refund/202601/decision_eligibility') return {
          eligible_decisions: [{ decision: 'APPROVE', is_eligible: true }, { decision: 'REJECT', is_eligible: true }],
        }
        if (path === '/return_refund/202606/review_decision') return { review_status: 'PENDING_REVIEW', is_eligible: true, reason_text: 'Review window open' }
        if (path === '/return_refund/202602/orders/O1/aftersale_eligibility') return {
          sku_eligibility: [{ sku_id: 'SKU1', request_types: ['REFUND', 'RETURN_AND_REFUND'], is_eligible: true }],
        }
        throw new Error(`unexpected ${path}`)
      },
    },
    'services/core/cache': { get: async (k) => store.get(k), set: async (k, v) => { store.set(k, v) }, del: async () => {} },
    '../service': { decideReturn: async (token, id, opts) => { decided.push([id, opts.decision, opts.rejectReason]); return {} } },
  })
  return { returns: freshRequire('marketplaces/tiktok_shop/sections/returns-cancellations.js'), calls, restore }
}

test('return history lists each step', async () => {
  const { returns, restore } = load()
  try {
    const rows = (await returns('tok', { _id: 's1' })).tables.find((t) => t.id === 'returns').rows
    assert.ok(rows[0].actions.some((a) => a.id === 'records' && a.detail))
    const detail = await returns.details.records('tok', { _id: 's1' }, 'R1')
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.who, r.what]), [['Seller', 'Waiting for seller'], ['Buyer', 'Buyer asked for a refund (Damaged)']])
  } finally { restore() }
})

test("reject offers TikTok's reasons and sends the chosen code", async () => {
  const decided = []
  const { returns, calls, restore } = load({ decided })
  try {
    const rows = (await returns('tok', { _id: 's1' })).tables.find((t) => t.id === 'returns').rows
    const reject = rows[0].actions.find((a) => a.id === 'reject')
    assert.deepEqual(reject.input.options, [{ value: 'seller_reject_apply_product_has_been_used', label: 'Item was used' }, { value: 'seller_reject_apply_wrong_item', label: 'Wrong item returned' }])
    assert.equal(calls.find(([, p]) => p.endsWith('reject_reasons'))[2].return_or_cancel_id, 'R1')
    assert.equal(rows[1].actions.find((a) => a.id === 'reject'), undefined)
    await returns('tok', { _id: 's1' })
    assert.equal(calls.filter(([, p]) => p.endsWith('reject_reasons')).length, 1, 'reasons are cached per return')
    const res = await returns.actions.reject('tok', { _id: 's1' }, 'R1', 'seller_reject_apply_wrong_item')
    assert.deepEqual(decided, [['R1', 'REJECT', 'seller_reject_apply_wrong_item']])
    assert.ok(res.message)
    await assert.rejects(returns.actions.reject('tok', { _id: 's1' }, 'R1', ''), (e) => e.status === 400)
  } finally { restore() }
})

test('Aftersales & RMA tab, refund-preview, aftersale-eligibility, and return-tracking work', async () => {
  const { returns, calls, restore } = load()
  try {
    const data = await returns('tok', { _id: 's1' })
    assert.deepEqual(data.tables.map((t) => t.id), ['returns', 'cancellations', 'aftersales', 'rmas'])
    assert.deepEqual(data.tables.map((t) => t.tab), ['Returns & cancellations', 'Returns & cancellations', 'Aftersales & RMA', 'Aftersales & RMA'])

    const openRow = data.tables[0].rows[0]
    assert.ok(openRow.actions.some((a) => a.id === 'refund-preview' && a.detail))
    assert.ok(openRow.actions.some((a) => a.id === 'return-tracking' && a.input.fields.length === 2))
    assert.equal(data.tables[0].rows[1].actions.find((a) => a.id === 'return-tracking'), undefined)

    const aftersaleRow = data.tables[2].rows[0]
    assert.equal(aftersaleRow.id, 'O1')
    assert.ok(aftersaleRow.actions.some((a) => a.id === 'aftersale-eligibility' && a.detail))

    const preview = await returns.details['refund-preview']('tok', { _id: 's1' }, 'R1')
    assert.equal(preview.tables[0].rows[0].amount.value, 12.5)
    assert.ok(preview.tables[1].rows.some((r) => r.source === 'Decision eligibility' && r.decision === 'Approve'))
    assert.ok(preview.tables[1].rows.some((r) => r.source === 'Review status' && r.reason === 'Review window open'))

    const elig = await returns.details['aftersale-eligibility']('tok', { _id: 's1' }, 'O1')
    assert.equal(elig.tables[0].rows[0].sku, 'SKU1')
    assert.equal(elig.tables[0].rows[0].eligible, 'Yes')

    const tracked = await returns.actions['return-tracking']('tok', { _id: 's1' }, 'R1', { trackingNumber: 'TRK-77', carrier: 'UPS' })
    assert.match(tracked.message, /TRK-77/)
    const shipCall = calls.find(([, p]) => p === '/return_refund/202405/returns/shipping_documents')
    assert.deepEqual(shipCall[2], { return_ids: 'R1' })
    assert.deepEqual(shipCall[3], { tracking_number: 'TRK-77', shipping_provider_name: 'UPS', document_type: 'TRACKING_INFO' })
    await assert.rejects(returns.actions['return-tracking']('tok', { _id: 's1' }, 'R1', { trackingNumber: '', carrier: 'UPS' }), (e) => e.status === 400)
  } finally { restore() }
})
