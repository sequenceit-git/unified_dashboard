const test = require('node:test')
const assert = require('node:assert/strict')
const { run } = require('../scripts/removeInboxData')

const fakeDb = (counts) => {
  const calls = []
  return {
    calls,
    shopIds: async () => ['s1', 's2'],
    count: async (shopIds) => { calls.push(['count', shopIds]); return counts },
    backup: async (shopIds) => calls.push(['backup', shopIds]),
    remove: async (shopIds) => { calls.push(['remove', shopIds]); return counts },
  }
}

test('a dry run only counts the TikTok conversations, messages and inbox notifications', async () => {
  const db = fakeDb({ conversations: 3, messages: 9, notifications: 2 })
  const summary = await run({ apply: false, db, log: () => {} })
  assert.deepEqual(summary, { shops: 2, conversations: 3, messages: 9, notifications: 2, applied: false })
  assert.deepEqual(db.calls, [['count', ['s1', 's2']]])
})

test('--apply backs up before deleting, only for TikTok shops', async () => {
  const db = fakeDb({ conversations: 3, messages: 9, notifications: 2 })
  await run({ apply: true, db, log: () => {} })
  assert.deepEqual(db.calls.map((c) => c[0]), ['count', 'backup', 'remove'])
  assert.ok(db.calls.every((c) => c[1].join() === 's1,s2'))
})

test('nothing to remove means no backup and no delete', async () => {
  const db = fakeDb({ conversations: 0, messages: 0, notifications: 0 })
  await run({ apply: true, db, log: () => {} })
  assert.deepEqual(db.calls.map((c) => c[0]), ['count'])
})
