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
