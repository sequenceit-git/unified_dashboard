import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/pages/dashboard/overviewView.js')
test.after(() => server.close())

const SHOPS = [
  { key: 'a', label: 'Shop A', urlId: 'a', badgeColor: 'blue', subsections: [{ id: 'orders' }, { id: 'analytics' }, { id: 'inventory' }, { id: 'messages' }] },
  { key: 'b', label: 'Shop B', urlId: 'bb', badgeColor: 'purple', subsections: [{ id: 'orders' }, { id: 'inventory' }] },
]

test('greeting by the hour', async () => {
  const { greeting } = await load()
  assert.deepEqual([5, 11, 12, 17, 18, 23, 2].map(greeting), ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening', 'Good evening'])
})

test('change vs previous 30 days', async () => {
  const { change } = await load()
  assert.deepEqual(change(108, 100), { pct: 8, text: '+8%', up: true })
  assert.deepEqual(change(90, 100), { pct: -10, text: '−10%', up: false })
  assert.equal(change(50, 0), null)
  assert.equal(change(50, null), null)
})

test('needs attention: only counted items, each with a link; a failed part says so', async () => {
  const { attentionItems } = await load()
  const data = {
    unified: { readyToShip: 9, openInbox: 4, lowStock: 8 },
    attention: { late: 2, outOfStock: 3, syncFailed24h: 0, loginProblems: [{ shopId: 's2', name: 'My B', marketplace: 'b', problem: 'login stopped working' }] },
    errors: {},
  }
  const items = attentionItems(data, SHOPS)
  assert.deepEqual(items.map((i) => [i.id, i.text, i.to]), [
    ['toShip', '9 orders to ship (2 past ship-by)', '/a/orders'],
    ['inbox', '4 messages waiting', '/a/messages'],
    ['stock', '3 out of stock · 5 low', '/a/inventory'],
    ['login-s2', 'My B (Shop B): login stopped working', '/settings'],
  ])
  const broken = attentionItems({ unified: {}, attention: null, errors: { attention: 'db down' } }, SHOPS)
  assert.deepEqual(broken.map((i) => i.id), ['attentionError'])
  assert.match(broken[0].text, /couldn't check/)
})

test('chart rows: one value per shop per day, with a total', async () => {
  const { chartRows } = await load()
  const rows = chartRows([{ date: '2026-11-24', shops: { a: { revenue: 10, orders: 1 }, b: { revenue: 5, orders: 2 } } }, { date: '2026-11-25', shops: {} }], 'revenue', SHOPS)
  assert.deepEqual(rows, [{ date: '2026-11-24', label: '24 Nov', a: 10, b: 5, total: 15 }, { date: '2026-11-25', label: '25 Nov', a: 0, b: 0, total: 0 }])
})

test('shop links and colours come from the registry', async () => {
  const { shopLink, shopColor } = await load()
  assert.equal(shopLink(SHOPS[1], 'orders', 'X 1'), '/bb/orders?q=X%201')
  assert.equal(shopLink(SHOPS[1], 'analytics'), null)
  assert.equal(shopColor(SHOPS[0], 0), '#2563eb')
  assert.equal(shopColor({ key: 'z' }, 2), shopColor({ key: 'y' }, 2))
})
