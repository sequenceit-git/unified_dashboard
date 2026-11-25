const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p; p.distinct = async () => v.map((r) => r._id); return p }

test('eBay stock history is only eBay products and shops, even when the page asks without a marketplace', async () => {
  const seen = []
  const restore = stubModules({
    '/models/InventoryLog': { find: (f) => { seen.push(f); return chain([]) }, countDocuments: async (f) => { seen.push(f); return 0 }, populate: async (rows) => rows },
    '/models/Product': { find: (q) => { seen.push(['products', q]); return chain([{ _id: 'p1' }]) } },
    '/models/Listing': { find: () => ({ distinct: async () => [] }) },
    '/models/Shop': { find: (q) => { seen.push(['shops', q]); return chain([{ _id: 's1' }]) } },
  })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/inventory.js')
    await service.logs({ user: { role: 'super_admin' }, query: {}, body: {}, params: {} })
    const filter = seen.find((f) => f && f.$and)
    assert.ok(filter, 'the history is filtered')
    const scope = filter.$and.find((c) => c.$or)
    assert.deepEqual(scope.$or, [{ shopId: { $in: ['s1'] } }, { productId: { $in: ['p1'] } }])
    assert.ok(seen.some((s) => Array.isArray(s) && s[0] === 'products' && s[1].marketplace === 'ebay'))
    assert.ok(seen.some((s) => Array.isArray(s) && s[0] === 'shops' && s[1].marketplace === 'ebay'))
  } finally { restore() }
})
