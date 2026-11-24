import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/goods/goodsView.js')
test.after(() => server.close())

const COUNTS = { all: 48, live: 30, pending: 3, unlisted: 8, out_of_stock: 3, paused: 2, error: 2, ended: 0 }
const SIGNALS = { goods: { 1: { traffic: 'Traffic restricted' }, 2: { traffic: 'Low traffic', compliance: true }, 3: { priceReview: true }, 4: { traffic: 'Traffic restricted' } }, unavailable: [] }

test("pills use Temu's own state names, Removed only when there are some", async () => {
  const { statusPills } = await load()
  assert.deepEqual(statusPills(COUNTS).map((p) => [p.key, p.label, p.count]), [
    ['all', 'All', 48], ['live', 'On sale', 30], ['pending', 'Under review', 3], ['unlisted', 'Not on Temu', 8],
    ['out_of_stock', 'Sold out', 3], ['paused', 'Off sale', 2], ['error', 'Rejected', 2],
  ])
  assert.ok(statusPills({ ...COUNTS, ended: 1 }).some((p) => p.label === 'Removed'))
})

test('needs attention: rejected, sold out, restricted traffic, price reviews (compliance is only a chip)', async () => {
  const { attentionItems, summaryLine, signalTotals } = await load()
  const totals = signalTotals({ ...SIGNALS, totals: { restricted: 3, low: 1, compliance: 2, priceReview: 1 } })
  assert.deepEqual(totals, { restricted: 3, low: 1, compliance: 2, priceReview: 1 }, "the server's per-row totals")
  const items = attentionItems(COUNTS, totals)
  assert.deepEqual(items.map((i) => i.id), ['error', 'out', 'restricted', 'price'])
  assert.equal(items[0].text, '2 rejected by Temu')
  assert.equal(items[3].to, '/temu/price-reviews')
  assert.equal(summaryLine(COUNTS, totals), '48 goods · 30 on sale · 9 need attention')
  assert.deepEqual(signalTotals(null), { restricted: 0, low: 0, compliance: 0, priceReview: 0 })
})

test("each row's next step in Temu terms", async () => {
  const { mainAction } = await load()
  const at = (status, opts) => mainAction({ shopListing: status ? { status } : null }, opts).id
  assert.equal(at(null), 'list')
  assert.equal(at('ended'), 'list')
  assert.equal(at('error'), 'fix')
  assert.equal(at('out_of_stock'), 'restock')
  assert.equal(at('out_of_stock', { canRestock: false }), 'edit')
  assert.equal(at('paused'), 'publish')
  assert.equal(at('live'), 'edit')
  assert.equal(at('pending'), 'edit')
})

test('chips per goods from its Temu goods id', async () => {
  const { goodsIdOf, chipsFor } = await load()
  assert.equal(goodsIdOf('601234:77'), '601234')
  assert.equal(goodsIdOf(null), '')
  assert.deepEqual(chipsFor(SIGNALS.goods[2]).map((c) => c.label), ['Low traffic', 'Compliance to check'])
  assert.deepEqual(chipsFor(undefined), [])
})
