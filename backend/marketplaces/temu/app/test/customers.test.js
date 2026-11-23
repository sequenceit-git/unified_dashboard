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
