const test = require('node:test')
const assert = require('node:assert/strict')
const { planRename, run } = require('../scripts/renameSections')

test('stored permissions follow the rename', () => {
  const plan = planRename({ users: [{ _id: 'u1', allowedSections: ['ebay:products', 'temu:fulfillment', 'orders', 'returns'] }], shops: [] })
  // A bare id gains the bare new names (each is unique to one shop), never a shop the user didn't have.
  assert.deepEqual(plan.users, [['u1', ['ebay:listings', 'temu:shipping', 'orders', 'returns', 'returns-cases', 'returns-cancellations', 'after-sales']]])
})

test('shop access keys follow the rename', () => {
  const plan = planRename({ users: [], shops: [{ _id: 's1', marketplace: 'temu', apiAccess: { products: { ok: true }, orders: { ok: false, reason: 'x' } } }] })
  assert.deepEqual(plan.shops, [['s1', { goods: { ok: true }, orders: { ok: false, reason: 'x' } }]])
})

test('a second run changes nothing', () => {
  const users = [{ _id: 'u1', allowedSections: ['ebay:listings', 'temu:shipping', 'orders', 'returns', 'returns-cases', 'returns-cancellations', 'after-sales'] }]
  const shops = [{ _id: 's1', marketplace: 'temu', apiAccess: { goods: { ok: true } } }]
  assert.deepEqual(planRename({ users, shops }), { users: [], shops: [] })
})

test('the runner writes only with --apply, after a backup', async () => {
  const calls = []
  const db = {
    load: async () => ({ users: [{ _id: 'u1', allowedSections: ['ebay:products'] }], shops: [] }),
    backup: async () => { calls.push('backup') },
    writeUsers: async (rows) => { calls.push(`users:${rows.length}`) },
    writeShops: async (rows) => { calls.push(`shops:${rows.length}`) },
  }
  const dry = await run({ apply: false, db, log: () => {} })
  assert.deepEqual(calls, [])
  assert.deepEqual(dry, { users: 1, shops: 0, applied: false })
  await run({ apply: true, db, log: () => {} })
  assert.deepEqual(calls, ['backup', 'users:1', 'shops:0'])
})

test("a single-shop sub-admin gets no other shop's entries", () => {
  const plan = planRename({ users: [{ _id: 'u2', allowedSections: ['tiktok_shop:products', 'products', 'tiktok_shop:returns', 'returns'] }], shops: [] })
  const after = plan.users[0][1]
  assert.ok(!after.some((entry) => /^(ebay|temu):/.test(entry)), JSON.stringify(after))
  assert.ok(after.includes('tiktok_shop:returns-cancellations'))
})
