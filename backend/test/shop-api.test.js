const test = require('node:test')
const assert = require('node:assert/strict')
const { onlyShop, belongsToShop } = require('../middleware/shopScope')

const run = (mw, req) => new Promise((resolve) => mw(req, { status: (code) => ({ json: (body) => resolve({ code, body }) }) }, () => resolve({ next: true })))

test('a shop API pins marketplace in query and body, whatever the client sent', async () => {
  const req = { query: { marketplace: 'temu', q: 'mug' }, body: { marketplace: 'temu', status: 'paid' }, user: { role: 'super_admin' } }
  assert.deepEqual(await run(onlyShop('ebay'), req), { next: true })
  assert.deepEqual(req.query, { marketplace: 'ebay', q: 'mug' })
  assert.deepEqual(req.body, { marketplace: 'ebay', status: 'paid' })
  assert.equal(req.shopKey, 'ebay')
})

test("a sub-admin on a shop's API only keeps that shop's stores", async () => {
  const req = {
    query: {}, body: {}, user: { role: 'sub_admin' },
    allowedShopIds: ['s-ebay', 's-temu'],
    shopMarkets: new Map([['s-ebay', 'ebay'], ['s-temu', 'temu']]),
  }
  await run(onlyShop('temu'), req)
  assert.deepEqual(req.allowedShopIds, ['s-temu'])
  const other = { ...req, allowedShopIds: ['s-ebay'] }
  await run(onlyShop('temu'), other)
  assert.deepEqual(other.allowedShopIds, [], 'no Temu store granted → nothing to see on /api/temu')
})

test("another shop's record id answers 404 on this shop's API", async () => {
  const rows = [{ _id: 'o1', marketplace: 'ebay' }]
  const Model = {
    schema: { path: (name) => name === 'marketplace' },
    exists: async (q) => rows.some((r) => r._id === q._id && r.marketplace === q.marketplace),
  }
  const guard = belongsToShop(() => Model, 'temu', 'Order')
  const asParam = (id) => new Promise((resolve) => guard({}, { status: (code) => ({ json: (body) => resolve({ code, body }) }) }, () => resolve({ next: true }), id))
  assert.deepEqual(await asParam('o1'), { code: 404, body: { error: 'Order not found' } })
  assert.deepEqual(await belongsToShopOk(Model, 'ebay', 'o1'), { next: true })
})

function belongsToShopOk(Model, key, id) {
  const guard = belongsToShop(() => Model, key, 'Order')
  return new Promise((resolve) => guard({}, { status: () => ({ json: () => resolve({ code: 404 }) }) }, () => resolve({ next: true }), id))
}

test('each shop exposes only its own route groups (Temu has no inbox)', () => {
  const groups = (key) => [...new Set(require(`../marketplaces/${key}`).app.api.routeList.map((r) => r.split(' ')[1].split('/')[1]))].sort()
  assert.deepEqual(groups('temu'), ['analytics', 'customers', 'goods', 'inventory', 'orders', 'sections', 'shops'])
  assert.ok(groups('ebay').includes('messages'))
  assert.ok(groups('tiktok_shop').includes('customer-service'))
})
