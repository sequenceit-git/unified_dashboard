import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/payouts/payoutsView.js')
test.after(() => server.close())

const $ = (value) => ({ value, currency: 'USD' })
const SUMMARY = [
  { tab: 'Funds', label: 'Available', value: $(412.3), type: 'money' },
  { tab: 'Funds', label: 'On hold', value: $(58), type: 'money' },
  { tab: 'Payouts', label: 'Paid out', value: $(3904), type: 'money' },
  { tab: 'Order earnings', label: 'Net earnings', value: $(1200), type: 'money' },
]

test('funds on top, each list its own totals', async () => {
  const { fundsTiles, tilesFor } = await load()
  assert.deepEqual(fundsTiles(SUMMARY).map((s) => s.label), ['Available', 'On hold'])
  assert.deepEqual(tilesFor(SUMMARY, { tab: 'Order earnings' }).map((s) => s.label), ['Net earnings'])
  assert.deepEqual(tilesFor(SUMMARY, null), [])
})

test('header: available, on hold, paid out', async () => {
  const { payoutSummary } = await load()
  assert.equal(payoutSummary(SUMMARY), '$412.30 available · $58.00 on hold · $3,904.00 paid out')
  assert.equal(payoutSummary([]), '')
})

test('a pill per list', async () => {
  const { PAYOUT_PILLS } = await load()
  assert.deepEqual(PAYOUT_PILLS.map((p) => p.table), ['payouts', 'transactions', 'earnings', 'billing'])
})
