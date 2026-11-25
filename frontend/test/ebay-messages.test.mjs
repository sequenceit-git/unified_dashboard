import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/messages/messagesView.js')
test.after(() => server.close())

test('list times: today as a time, this week as a weekday, older as a date', async () => {
  const { shortTime } = await load()
  const now = new Date(2026, 10, 25, 15, 0)
  assert.equal(shortTime(new Date(2026, 10, 25, 9, 5), now), new Date(2026, 10, 25, 9, 5).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  assert.equal(shortTime(new Date(2026, 10, 22, 9), now), new Date(2026, 10, 22).toLocaleDateString([], { weekday: 'short' }))
  assert.equal(shortTime(new Date(2026, 9, 2), now), new Date(2026, 9, 2).toLocaleDateString([], { day: 'numeric', month: 'short' }))
  assert.equal(shortTime(null, now), '')
})

test('the item card comes from the conversation order', async () => {
  const { itemCard } = await load()
  assert.deepEqual(itemCard({ orderId: { externalOrderId: '12-345', status: 'shipped', items: [{ title: 'Phone case', quantity: 2 }, { title: 'Mug', quantity: 1 }], totals: { total: 30 } } }), { title: 'Phone case', more: 1, units: 3, orderId: '12-345', status: 'shipped', total: 30 })
  assert.equal(itemCard({ orderId: null }), null)
  assert.equal(itemCard({ orderId: null, order: { externalOrderId: '9', items: [] } }).orderId, '9', 'the buyer order the server found')
  assert.equal(itemCard({ orderId: 'abc' }), null)
})

test('filter pills', async () => {
  const { INBOX_PILLS } = await load()
  assert.deepEqual(INBOX_PILLS.map((p) => p.key), ['buyers', 'unread', 'all', 'notices'])
})

test('which thread is open: picked automatically only on first load or a new filter; an open one stays', async () => {
  const { nextActive, sortConvos } = await load()
  const list = [{ _id: 'b' }, { _id: 'c' }]
  assert.equal(nextActive({ activeId: null, list, auto: true }), 'b')
  assert.equal(nextActive({ activeId: 'a', list, auto: false }), 'a', 'read and gone from Unread: still open, not the next buyer')
  assert.equal(nextActive({ activeId: 'a', list: [], auto: true }), null)
  assert.equal(nextActive({ activeId: null, list, auto: false }), null)
  assert.deepEqual(sortConvos([
    { _id: 'old-unread', unreadCount: 2, lastMessageAt: '2026-11-01' },
    { _id: 'new-read', unreadCount: 0, lastMessageAt: '2026-11-20' },
    { _id: 'new-unread', unreadCount: 1, lastMessageAt: '2026-11-21' },
  ]).map((c) => c._id), ['old-unread', 'new-unread', 'new-read'])
})
