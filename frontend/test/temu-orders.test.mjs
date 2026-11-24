import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/orders/ordersView.js')
test.after(() => server.close())

const COUNTS = { all: 126, toShip: 9, late: 2, shipped: 20, delivered: 90, cancelled: 5, unpaid: 0 }
const NOW = new Date('2026-11-25T12:00:00Z')

test('pills: To ship first, Late only when some are late, Unpaid only when some are', async () => {
  const { orderPills } = await load()
  assert.deepEqual(orderPills(COUNTS).map((p) => [p.key, p.label, p.count]), [
    ['toShip', 'To ship', 9], ['late', 'Late', 2], ['shipped', 'Shipped', 20], ['delivered', 'Delivered', 90], ['cancelled', 'Cancelled', 5], ['all', 'All', 126],
  ])
  assert.deepEqual(orderPills(COUNTS).find((p) => p.key === 'late').query, { late: '1' })
  assert.deepEqual(orderPills(COUNTS).find((p) => p.key === 'toShip').query, { status: 'paid' })
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

test('ship-by: when to ship, or how late', async () => {
  const { shipByText } = await load()
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-27T12:00:00Z' } }, NOW), { text: 'in 2 days', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-25T18:00:00Z' } }, NOW), { text: 'today', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-23T12:00:00Z' } }, NOW), { text: 'late 2 days', late: true })
  assert.equal(shipByText({ status: 'shipped', shipping: { shipBy: '2026-11-23T12:00:00Z' } }, NOW), null)
  assert.equal(shipByText({ status: 'paid' }, NOW), null)
})

test("each order's next step", async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ status: 'paid' }).label, 'Ship')
  assert.equal(mainAction({ status: 'shipped' }).label, 'Details')
})
