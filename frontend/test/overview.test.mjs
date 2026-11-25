import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/pages/dashboard/overviewView.js')
test.after(() => server.close())

const SHOPS = [
  {
    key: 'a',
    label: 'Shop A',
    urlId: 'a',
    badgeColor: 'blue',
    renamedSections: { products: 'listings', returns: 'returns-cases', inbox: 'messages' },
    subsections: [{ id: 'orders' }, { id: 'analytics' }, { id: 'inventory' }, { id: 'messages' }, { id: 'listings', route: 'products' }, { id: 'returns-cases', route: 'orders' }],
  },
  {
    key: 'b',
    label: 'Shop B',
    urlId: 'bb',
    badgeColor: 'purple',
    renamedSections: { products: 'goods', returns: 'after-sales' },
    subsections: [{ id: 'orders' }, { id: 'inventory' }, { id: 'goods', route: 'products' }, { id: 'after-sales', route: 'orders' }],
  },
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

test('needs attention: only counted items, deep-linked to affected shop; failed checks report clearly', async () => {
  const { attentionItems } = await load()
  const data = {
    unified: { readyToShip: 9, openInbox: 4, lowStock: 8 },
    byShop: [
      { shopId: 's1', marketplace: 'a', toShip: 2, outOfStock: 0, lowStock: 1, unread: 4, openReturns: 0, listingErrors: 0 },
      { shopId: 's2', marketplace: 'b', toShip: 7, outOfStock: 3, lowStock: 4, unread: 0, openReturns: 2, listingErrors: 1 },
    ],
    attention: {
      late: 2,
      openReturns: 2,
      listingErrors: 1,
      outOfStock: 3,
      unreadMessages: 6,
      syncFailed24h: 0,
      loginProblems: [{ shopId: 's2', name: 'My B', marketplace: 'b', problem: 'login stopped working' }],
    },
    errors: {},
  }
  const items = attentionItems(data, SHOPS)
  assert.deepEqual(items.map((i) => [i.id, i.text, i.to]), [
    ['toShip', '9 orders to ship (2 past ship-by)', '/bb/orders'],
    ['returns', '2 returns awaiting action', '/bb/after-sales'],
    ['inbox', '4 unread buyer chats (6 messages)', '/a/messages?type=unread'],
    ['stock', '3 out of stock · 5 low', '/bb/inventory'],
    ['listingErrors', '1 listing error', '/bb/goods'],
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

test('shop sections, links, share and colours come from the registry', async () => {
  const { shopLink, shopColor, shopSection, shopShare } = await load()
  assert.equal(shopSection(SHOPS[0], 'catalog'), 'listings')
  assert.equal(shopSection(SHOPS[1], 'catalog'), 'goods')
  assert.equal(shopSection(SHOPS[1], 'returns'), 'after-sales')
  assert.equal(shopLink(SHOPS[1], 'orders', 'X 1'), '/bb/orders?q=X%201')
  assert.equal(shopLink(SHOPS[0], 'messages', null, { type: 'unread' }), '/a/messages?type=unread')
  assert.equal(shopLink(SHOPS[1], 'analytics'), null)
  assert.equal(shopColor(SHOPS[0], 0), '#2563eb')
  assert.equal(shopColor({ key: 'z' }, 2), shopColor({ key: 'y' }, 2))
  const share = shopShare([
    { shopId: 's1', name: 'My A', marketplace: 'a', revenue: 150, prevRevenue: 100, orders: 3 },
    { shopId: 's2', name: 'My B', marketplace: 'b', revenue: 50, prevRevenue: 50, orders: 1 },
  ], SHOPS)
  assert.deepEqual(share.map((s) => [s.key, s.pct, s.color]), [['a', 75, '#2563eb'], ['b', 25, '#9333ea']])
})

test('stock warning stays when the other checks failed', async () => {
  const { attentionItems } = await load()
  const items = attentionItems({ unified: { lowStock: 4 }, attention: null, errors: { attention: 'db down' } }, SHOPS)
  assert.deepEqual(items.map((i) => [i.id, i.text]).slice(0, 1), [['stock', '4 low or out of stock']])
})

test('a shop missing from the registry still gets a colour', async () => {
  const { shopColor } = await load()
  assert.match(shopColor(undefined, -1), /^#/)
})
