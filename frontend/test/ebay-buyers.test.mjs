import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/buyers/buyersView.js')
test.after(() => server.close())

test('pills and summary', async () => {
  const { buyerPills, buyerSummary } = await load()
  assert.deepEqual(buyerPills({ all: 40, repeat: 7 }, { received: 12, awaiting: 3 }).map((p) => [p.key, p.count]), [['all', 40], ['repeat', 7], ['received', 12], ['awaiting', 3]])
  assert.deepEqual(buyerPills(null, null).map((p) => p.count), [null, null, null, null])
  assert.equal(buyerSummary({ all: 40, repeat: 7 }, '', 99.2), '40 buyers · 7 repeat buyers (18%) · 99.2% positive feedback')
  assert.equal(buyerSummary({ all: 3, repeat: 1 }, 'ann'), '3 matching buyers · 1 repeat buyer (33%)')
})

test('order link and the feedback a buyer left', async () => {
  const { orderLink, feedbackFrom } = await load()
  assert.equal(orderLink({ externalOrderId: '12-345' }), '/ebay/orders?q=12-345')
  const rows = [{ id: 'f1', buyer: 'JoBuyer' }, { id: 'f2', buyer: 'other' }]
  assert.deepEqual(feedbackFrom(rows, { identities: [{ marketplace: 'ebay', username: 'jobuyer' }] }).map((r) => r.id), ['f1'])
  assert.deepEqual(feedbackFrom(rows, { identities: [] }), [])
})
