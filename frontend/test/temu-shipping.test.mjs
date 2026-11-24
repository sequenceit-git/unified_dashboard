import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/shipping/shippingView.js')
test.after(() => server.close())

const NOW = new Date(2026, 10, 25, 15, 0)
const today = new Date(2026, 10, 25, 9, 0).toISOString()
const SECTION = { tables: [
  { id: 'unshipped', rows: [{ order: 'PO-1' }, { order: 'PO-2' }] },
  { id: 'labels', rows: [
    { packageSn: 'A', status: 'Bought', printed: 'Yes', created: today },
    { packageSn: 'B', status: 'Failed', printed: 'No', created: today },
    { packageSn: 'C', status: 'Bought', printed: 'No', created: new Date(2026, 10, 20).toISOString() },
  ] },
] }

test('shipping tiles: awaiting shipment, labels bought today, failed, not printed', async () => {
  const { shippingTiles } = await load()
  assert.deepEqual(shippingTiles(SECTION, NOW), { awaiting: 2, boughtToday: 1, failed: 1, notPrinted: 1 })
  assert.deepEqual(shippingTiles(null, NOW), { awaiting: null, boughtToday: null, failed: null, notPrinted: null })
})

test('labels: failed first, then newest', async () => {
  const { labelRows } = await load()
  assert.deepEqual(labelRows(SECTION.tables[1].rows).map((r) => r.packageSn), ['B', 'A', 'C'])
})

test('the order a label or shipment row belongs to (first one)', async () => {
  const { orderOf } = await load()
  assert.equal(orderOf({ order: 'PO-1' }), 'PO-1')
  assert.equal(orderOf({ orders: 'PO-7, PO-8' }), 'PO-7')
  assert.equal(orderOf({}), '')
})
