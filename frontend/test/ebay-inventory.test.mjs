import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/inventory/inventoryView.js')
test.after(() => server.close())

test('inventory pills, summary and needs attention from the stock counts', async () => {
  const { inventoryPills, inventorySummary, inventoryAttention } = await load()
  const stock = { lowCount: 5, outCount: 1 }
  assert.deepEqual(inventoryPills(stock, 212).map((p) => [p.key, p.label, p.count]), [['all', 'All', 212], ['low', 'Low stock', 4], ['out', 'Out of stock', 1], ['history', 'History', null]])
  assert.equal(inventorySummary(stock, 212), '212 products · 4 low · 1 out of stock')
  assert.equal(inventorySummary({ lowCount: 0, outCount: 0 }, 9), '9 products')
  assert.deepEqual(inventoryAttention(stock).map((i) => [i.text, i.pill]), [['1 out of stock', 'out'], ['4 running low', 'low']])
  assert.deepEqual(inventoryAttention({ lowCount: 0, outCount: 0 }), [])
  assert.deepEqual(inventoryAttention(null), [])
})

test('Adjust stock says what eBay does with the new quantity', async () => {
  const { stockNote } = await load()
  const L = (status) => ({ externalListingId: '123', status })
  assert.equal(stockNote(L('paused'), 5, false), 'eBay gets 5 for this listing when you save.')
  assert.equal(stockNote(L('pending'), 2, true), 'eBay gets 2 for this variant when you save.')
  assert.match(stockNote(L('ended'), 5, false), /relists this on eBay with 5/)
  assert.match(stockNote(L('ended'), 0, false), /only the dashboard changes/)
  assert.match(stockNote(null, 5, false), /only the dashboard changes/)
})
