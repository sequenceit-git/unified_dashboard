const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

test('a customer who also bought on eBay keeps the eBay relay email on this shop\'s page', async () => {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const restore = stubModules({ '/models/Order': { find: () => chain([]) }, '/models/Customer': {} })
  try {
    const { withOrderStats } = freshRequire('marketplaces/temu/app/services/customerStats.js')
    const [row] = await withOrderStats([{ _id: 'c1', name: 'Jo', identities: [{ marketplace: 'ebay', username: 'JoBuyer99' }] }], 'temu')
    assert.equal(row.email, 'jobuyer99@members.ebay.com')
  } finally {
    restore()
  }
})

test('customers list: Repeat buyers filter and counts for the pills', async () => {
  const rows = [
    { _id: 'a', name: 'Ann', orderCount: 3, totalSpent: 90, lastOrderAt: '2026-11-20' },
    { _id: 'b', name: 'Bob', orderCount: 1, totalSpent: 10, lastOrderAt: '2026-11-21' },
    { _id: 'c', name: 'Cy', orderCount: 2, totalSpent: 40, lastOrderAt: '2026-11-19' },
  ]
  const restore = stubModules({
    '/models/Customer': { find: async () => rows },
    '/models/Order': {},
    '/models/Conversation': {},
    '/customerStats': { withOrderStats: async (list) => list, findCustomerOrders: async () => [] },
  })
  try {
    const { list } = freshRequire('marketplaces/temu/app/services/customers.js')
    const ctx = (query) => ({ query, user: { role: 'admin' } })
    const all = await list(ctx({}))
    assert.deepEqual(all.counts, { all: 3, repeat: 2 })
    const repeat = await list(ctx({ repeat: '1' }))
    assert.deepEqual(repeat.data.map((r) => r._id), ['a', 'c'])
    assert.equal(repeat.total, 2)
    const searched = await list(ctx({ q: 'ann' }))
    assert.deepEqual(searched.counts, { all: 1, repeat: 1 })
  } finally { restore() }
})
