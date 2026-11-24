import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/inventory/inventoryView.js')
test.after(() => server.close())

test('inventory pills, summary and needs attention from the stock counts', async () => {
  const { inventoryPills, inventorySummary, inventoryAttention } = await load()
  const stock = { lowCount: 5, outCount: 1 }
  assert.deepEqual(inventoryPills(stock, 212).map((p) => [p.key, p.label, p.count]), [['all', 'All', 212], ['low', 'Low stock', 4], ['out', 'Out of stock', 1], ['history', 'History', null]])
  assert.equal(inventorySummary(stock, 212), '212 goods · 4 low · 1 out of stock')
  assert.equal(inventorySummary({ lowCount: 0, outCount: 0 }, 9), '9 goods')
  assert.deepEqual(inventoryAttention(stock).map((i) => [i.text, i.pill]), [['1 out of stock', 'out'], ['4 running low', 'low']])
  assert.deepEqual(inventoryAttention({ lowCount: 0, outCount: 0 }), [])
  assert.deepEqual(inventoryAttention(null), [])
})
