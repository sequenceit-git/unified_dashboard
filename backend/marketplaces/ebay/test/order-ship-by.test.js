const test = require('node:test')
const assert = require('node:assert/strict')
const { freshRequire } = require('../../../test/helpers/stub')

test("eBay's ship-by date: the earliest line item shipByDate", () => {
  const { ebayShipBy } = freshRequire('marketplaces/ebay/hooks.js')
  assert.equal(ebayShipBy({ lineItems: [
    { lineItemFulfillmentInstructions: { shipByDate: '2026-11-28T07:59:59.000Z' } },
    { lineItemFulfillmentInstructions: { shipByDate: '2026-11-27T07:59:59.000Z' } },
    { lineItemFulfillmentInstructions: {} },
  ] }).toISOString(), '2026-11-27T07:59:59.000Z')
  assert.equal(ebayShipBy({ lineItems: [{}] }), undefined)
  assert.equal(ebayShipBy({}), undefined)
})

test('open eBay orders still missing a ship-by date are re-read (up to 20 per sync, not ones already fetched)', async () => {
  const { stubModules } = require('../../../test/helpers/stub')
  const seen = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = (n) => { if (m === 'limit') seen.push(['limit', n]); return p }; return p }
  const restore = stubModules({
    '/models/Order': { find: (q) => { seen.push(['find', q]); return chain([{ externalOrderId: 'A' }, { externalOrderId: 'B' }]) } },
  })
  try {
    const { ordersMissingShipBy } = freshRequire('marketplaces/ebay/hooks.js')
    const asked = []
    const service = { getOrder: async (token, id) => { asked.push(id); return id === 'B' ? null : { orderId: id } } }
    const extra = await ordersMissingShipBy({ _id: 's1' }, 'tok', service, new Set(['C']))
    assert.deepEqual(extra.map((o) => o.orderId), ['A'])
    assert.deepEqual(asked, ['A', 'B'])
    const q = seen.find(([k]) => k === 'find')[1]
    assert.deepEqual(q.status, { $in: ['paid', 'processing'] })
    assert.equal(q['shipping.shipBy'], null)
    assert.deepEqual(q.externalOrderId, { $nin: ['C'] })
    assert.ok(seen.some(([k, n]) => k === 'limit' && n === 20))
  } finally { restore() }
})
