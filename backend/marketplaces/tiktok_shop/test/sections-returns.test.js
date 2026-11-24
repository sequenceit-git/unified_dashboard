const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

function load({ decided = [] } = {}) {
  const calls = []
  const store = new Map()
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttPost: async (token, shop, path) => {
        calls.push(['POST', path])
        if (path.endsWith('/returns/search')) return { return_orders: [
          { return_id: 'R1', order_id: 'O1', return_type: 'REFUND', return_status: 'RETURN_OR_REFUND_REQUEST_PENDING' },
          { return_id: 'R2', order_id: 'O2', return_type: 'REFUND', return_status: 'REFUND_SUCCESS' },
        ] }
        if (path.endsWith('/cancellations/search')) return { cancellations: [] }
        throw new Error(`unexpected ${path}`)
      },
      ttGet: async (token, shop, path, query) => {
        calls.push(['GET', path, query])
        if (path === '/return_refund/202309/reject_reasons') return { reasons: [{ name: 'seller_reject_apply_product_has_been_used', text: 'Item was used' }, { name: 'seller_reject_apply_wrong_item', text: 'Wrong item returned' }] }
        if (path === '/return_refund/202309/returns/R1/records') return { records: [
          { event: 'BUYER_REQUEST', role: 'BUYER', description: 'Buyer asked for a refund', reason_text: 'Damaged', create_time: 1764000000 },
          { event: 'SELLER_REVIEW', role: 'SELLER', description: 'Waiting for seller', create_time: 1764000600 },
        ] }
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
