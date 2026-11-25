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

test("pills own their totals (Transactions isn't shown the payout count); untabbed tiles kept on Payouts", async () => {
  const { tilesFor, PAYOUT_PILLS } = await load()
  const summary = [
    { tab: 'Payouts', label: 'Transactions', value: 1240, type: 'number' },
    { tab: 'Payouts', label: 'Sales paid out (90 days)', value: $(900), type: 'money' },
    { label: 'Something new', value: 1, type: 'number' },
  ]
  const [payouts, transactions] = PAYOUT_PILLS
  assert.deepEqual(tilesFor(summary, { tab: 'Payouts' }, transactions).map((s) => s.label), ['Sales paid out (90 days)'])
  assert.deepEqual(tilesFor(summary, { tab: 'Payouts' }, payouts).map((s) => s.label), ['Transactions', 'Something new'])
})

test('lists in pages of 15', async () => {
  const { pageOf } = await load()
  const rows = Array.from({ length: 40 }, (_, i) => i)
  assert.deepEqual([pageOf(rows, 1).rows.length, pageOf(rows, 3).rows.length, pageOf(rows, 3).pages, pageOf(rows, 9).page], [15, 10, 3, 3])
})

test('header money in the shop currency', async () => {
  const { payoutSummary } = await load()
  assert.match(payoutSummary([{ tab: 'Funds', label: 'Available', value: { value: 10, currency: 'GBP' } }]), /£10\.00 available/)
})
