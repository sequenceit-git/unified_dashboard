import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/orders/ordersView.js')
test.after(() => server.close())

const COUNTS = { all: 126, toShip: 9, late: 2, shipped: 20, delivered: 90, cancelled: 5, unpaid: 0, returns: 0 }
const NOW = new Date('2026-11-25T12:00:00Z')

test('pills: To ship first, Late only when some are late, Unpaid only when some are', async () => {
  const { orderPills } = await load()
  assert.deepEqual(orderPills(COUNTS).map((p) => [p.key, p.label, p.count]), [
    ['toShip', 'To ship', 9], ['late', 'Late', 2], ['shipped', 'Shipped', 20], ['delivered', 'Delivered', 90], ['cancelled', 'Cancelled', 5], ['all', 'All', 126],
  ])
  assert.deepEqual(orderPills(COUNTS).find((p) => p.key === 'late').query, { late: '1' })
  assert.deepEqual(orderPills(COUNTS).find((p) => p.key === 'toShip').query, { status: 'paid,processing' })
  assert.deepEqual(orderPills({ ...COUNTS, returns: 4 }).find((p) => p.key === 'returns').query, { status: 'returned,refunded' })
  assert.ok(!orderPills({ ...COUNTS, late: 0 }).some((p) => p.key === 'late'))
  assert.ok(orderPills({ ...COUNTS, unpaid: 1 }).some((p) => p.key === 'unpaid'))
})

test('summary and needs attention: late orders and orders Temu lets you ship together', async () => {
  const { summaryLine, attentionItems } = await load()
  assert.equal(summaryLine(COUNTS), '126 orders · 9 to ship · 2 past ship-by')
  assert.equal(summaryLine({ ...COUNTS, late: 0 }), '126 orders · 9 to ship')
  const items = attentionItems(COUNTS, 3)
  assert.deepEqual(items.map((i) => [i.id, i.text]), [['late', '2 past the ship-by date'], ['combine', '3 groups of orders can ship together']])
  assert.equal(items[0].pill, 'late')
  assert.deepEqual(attentionItems({ ...COUNTS, late: 0 }, 0), [])
})

test('ship-by: when to ship, or how late (local days)', async () => {
  const { shipByText } = await load()
  const now = new Date(2026, 10, 25, 12, 0)
  const at = (d, h = 12) => new Date(2026, 10, d, h, 0).toISOString()
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: at(27) } }, now), { text: 'in 2 days', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: at(25, 18) } }, now), { text: 'today', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: at(23) } }, now), { text: 'late 2 days', late: true })
  assert.equal(shipByText({ status: 'shipped', shipping: { shipBy: at(23) } }, now), null)
  assert.equal(shipByText({ status: 'paid' }, now), null)
})

test("each order's next step", async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ status: 'paid' }).label, 'Ship')
  assert.equal(mainAction({ status: 'processing' }).label, 'Ship')
  assert.equal(mainAction({ status: 'shipped' }).label, 'Details')
})

test("ship-by uses the user's own day; processing orders are still to ship", async () => {
  const { shipByText } = await load()
  const now = new Date(2026, 10, 25, 10, 0)
  const tonight = new Date(2026, 10, 25, 22, 0)
  assert.deepEqual(shipByText({ status: 'processing', shipping: { shipBy: tonight.toISOString() } }, now), { text: 'today', late: false })
})
