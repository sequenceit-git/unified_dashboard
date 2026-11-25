import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/offers/offersView.js')
test.after(() => server.close())

const NOW = new Date(2026, 10, 25, 10)
const at = (d, h = 12) => new Date(2026, 10, d, h).toISOString()

test('summary and expiry', async () => {
  const { summaryLine, expiresText, bySoonest } = await load()
  const rows = [{ id: 'a', expires: at(27) }, { id: 'b', expires: at(25, 20) }, { id: 'c', expires: null }]
  assert.equal(summaryLine(rows, 4, NOW), '3 offers waiting · 1 expires today · 4 listings with watchers')
  assert.deepEqual(expiresText(rows[1], NOW), { text: 'today', soon: true })
  assert.deepEqual(expiresText(rows[0], NOW), { text: 'in 2 days', soon: false })
  assert.deepEqual(expiresText({ expires: at(24) }, NOW), { text: 'expired', soon: true })
  assert.deepEqual(bySoonest(rows).map((r) => r.id), ['b', 'a', 'c'])
})

test('margin at a price: after cost; unknown cost gives nothing', async () => {
  const { margin } = await load()
  assert.deepEqual(margin(16, 8), { value: 8, pct: 50, text: '$8.00 margin before fees (50%)', loss: false })
  assert.equal(margin(7, 8).loss, true)
  assert.equal(margin(7, 8).value, -1)
  assert.equal(margin(16, null), null)
})

test('the price after a discount', async () => {
  const { discounted } = await load()
  assert.equal(discounted(20, 15), 17)
  assert.equal(discounted(null, 15), null)
})
