const test = require('node:test')
const assert = require('node:assert/strict')
const { freshRequire } = require('../../../../test/helpers/stub')

test('inbox list filter: buyer messages, notices, everything, unread; unread first', () => {
  const { conversationQuery } = freshRequire('marketplaces/ebay/app/services/inboxQuery.js')
  assert.deepEqual(conversationQuery({ type: 'buyers', status: 'open' }).filter, { status: 'open', replyable: { $ne: false } })
  assert.deepEqual(conversationQuery({ type: 'notices', status: 'all' }).filter, { replyable: false })
  assert.deepEqual(conversationQuery({ type: 'all' }).filter, {})
  assert.deepEqual(conversationQuery({ type: 'unread', status: 'open' }).filter, { status: 'open', replyable: { $ne: false }, unreadCount: { $gt: 0 } })
  assert.deepEqual(conversationQuery({}).sort, { unreadCount: -1, lastMessageAt: -1 })
})

test("the thread's order: its own link, else the buyer's latest order in that shop", async () => {
  const { stubModules } = require('../../../../test/helpers/stub')
  const asked = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({ '/models/Order': { findOne: (q) => { asked.push(q); return chain({ externalOrderId: '9-9', items: [] }) } } })
  try {
    const { threadOrder } = freshRequire('marketplaces/ebay/app/services/inboxQuery.js')
    assert.deepEqual(await threadOrder({ orderId: { externalOrderId: '1-1' } }), { externalOrderId: '1-1' })
    assert.deepEqual(await threadOrder({ orderId: null, customerId: { _id: 'c1' }, shopId: 's1' }), { externalOrderId: '9-9', items: [] })
    assert.deepEqual(asked[0], { shopId: 's1', customerId: 'c1' })
    assert.equal(await threadOrder({ orderId: null, customerId: null, shopId: 's1' }), null)
  } finally { restore() }
})
