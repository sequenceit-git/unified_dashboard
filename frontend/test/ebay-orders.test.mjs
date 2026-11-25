import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/orders/ordersView.js')
test.after(() => server.close())

const COUNTS = { all: 48, toShip: 6, late: 1, unpaid: 0, shipped: 10, delivered: 30, cancelled: 1, returns: 0, returnsRequested: 2 }

test('pills: to ship first; Late, Unpaid and Returns only when there are some', async () => {
  const { orderPills } = await load()
  assert.deepEqual(orderPills(COUNTS).map((p) => [p.key, p.count]), [['toShip', 6], ['late', 1], ['shipped', 10], ['delivered', 30], ['cancelled', 1], ['all', 48]])
  assert.deepEqual(orderPills(COUNTS)[0].query, { status: 'paid,processing' })
  assert.deepEqual(orderPills(null).map((p) => p.count).slice(0, 2), [null, null])
})

test('summary and needs attention', async () => {
  const { summaryLine, attentionItems } = await load()
  assert.equal(summaryLine(COUNTS), '48 orders · 6 to ship · 1 past ship-by')
  assert.deepEqual(attentionItems(COUNTS).map((i) => [i.id, i.text]), [['late', '1 past the ship-by date'], ['returns', '2 return requests waiting for you']])
  assert.deepEqual(attentionItems(null), [])
})

test('ship-by in the seller\'s own days, only for orders to ship', async () => {
  const { shipByText } = await load()
  const now = new Date(2026, 10, 25, 10)
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: new Date(2026, 10, 27, 9).toISOString() } }, now), { text: 'in 2 days', late: false })
  assert.deepEqual(shipByText({ status: 'processing', shipping: { shipBy: new Date(2026, 10, 25, 20).toISOString() } }, now), { text: 'today', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: new Date(2026, 10, 23, 9).toISOString() } }, now), { text: 'late 2 days', late: true })
  assert.equal(shipByText({ status: 'shipped', shipping: { shipBy: new Date(2026, 10, 23).toISOString() } }, now), null)
})

test('main row button: Add tracking for orders to ship, else Details', async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ status: 'paid' }).label, 'Add tracking')
  assert.equal(mainAction({ status: 'delivered' }).label, 'Details')
})
