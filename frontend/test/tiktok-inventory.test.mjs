import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/tiktok_shop/sections/inventory/inventoryView.js')
test.after(() => server.close())

test('inventory pills, summary and needs attention from the stock counts', async () => {
  const { inventoryPills, inventorySummary, inventoryAttention } = await load()
  const stock = { lowCount: 5, outCount: 1 }
  assert.deepEqual(inventoryPills(stock, 212).map((p) => [p.key, p.label, p.count]), [['all', 'All', 212], ['low', 'Low stock', 4], ['out', 'Out of stock', 1], ['history', 'History', null]])
  assert.equal(inventorySummary(stock, 212), '212 products · 4 low · 1 out of stock')
  assert.equal(inventorySummary({ lowCount: 0, outCount: 0 }, 9), '9 products')
  assert.deepEqual(inventoryAttention(stock).map((i) => [i.text, i.pill]), [['1 out of stock', 'out'], ['4 running low', 'low']])
  assert.deepEqual(inventoryAttention(null), [])
})

test('the TikTok stock check shows only when TikTok and the dashboard disagree', async () => {
  const { stockCheck } = await load()
  assert.equal(stockCheck([{ mismatch: false, dashboardStock: 3 }]).show, false, 'two-way sync agrees: nothing to show')
  assert.equal(stockCheck(null).show, false)
  const check = stockCheck([{ sku: 'A', mismatch: true, dashboardStock: 2 }, { sku: 'B', mismatch: false, dashboardStock: null }, { sku: 'C', mismatch: false, dashboardStock: 1 }])
  assert.equal(check.show, true)
  assert.deepEqual(check.differ.map((r) => r.sku), ['A'])
  assert.equal(check.notLinked, 1)
})

test('what TikTok does with the new number when you save', async () => {
  const { stockNote } = await load()
  assert.equal(stockNote({ externalListingId: '1', status: 'live' }, 4, false), 'TikTok gets 4 for this product when you save.')
  assert.equal(stockNote({ externalListingId: '1', status: 'paused' }, 2, true), 'TikTok gets 2 for this variant when you save.')
  assert.equal(stockNote({ externalListingId: '1', status: 'ended' }, 2, false), "This product isn't on sale on TikTok: only the dashboard changes.")
  assert.equal(stockNote(null, 2, false), "This product isn't on sale on TikTok: only the dashboard changes.")
})
