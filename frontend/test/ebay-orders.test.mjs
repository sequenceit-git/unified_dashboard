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
})

test('summary and needs attention', async () => {
  const { summaryLine, attentionItems } = await load()
  assert.equal(summaryLine(COUNTS), '48 orders · 6 to ship · 1 past ship-by')
  assert.deepEqual(attentionItems(COUNTS).map((i) => [i.id, i.text]), [['late', '1 past the ship-by date'], ['returns', '2 return requests waiting for you']])
  assert.deepEqual(attentionItems(null), [])
})

test("ship-by in eBay's own (Pacific) days, only for orders to ship", async () => {
  const { shipByText, shipByDate } = await load()
  const now = new Date('2026-11-25T18:00:00Z') // 10:00 on 25 Nov in Pacific time
  // eBay's ship-by is the end of a Pacific day (07:59:59 UTC the next morning).
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-28T07:59:59Z' } }, now), { text: 'in 2 days', late: false })
  assert.deepEqual(shipByText({ status: 'processing', shipping: { shipBy: '2026-11-26T07:59:59Z' } }, now), { text: 'today', late: false })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-24T07:59:59Z' } }, now), { text: 'late 2 days', late: true })
  assert.deepEqual(shipByText({ status: 'paid', shipping: { shipBy: '2026-11-25T17:00:00Z' } }, now), { text: 'late today', late: true })
  assert.equal(shipByText({ status: 'shipped', shipping: { shipBy: '2026-11-23T07:59:59Z' } }, now), null)
  assert.equal(shipByDate('2026-11-28T07:59:59Z'), new Date('2026-11-27T12:00:00Z').toLocaleDateString(undefined, { timeZone: 'America/Los_Angeles' }))
})

test('before the counts load, every pill shows (no count)', async () => {
  const { orderPills } = await load()
  assert.deepEqual(orderPills(null).map((p) => p.key), ['toShip', 'late', 'unpaid', 'shipped', 'delivered', 'cancelled', 'returns', 'all'])
})

test('main row button: Add tracking for orders to ship, else Details', async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ status: 'paid' }).label, 'Add tracking')
  assert.equal(mainAction({ status: 'delivered' }).label, 'Details')
})
