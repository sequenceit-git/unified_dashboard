const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

function load({ shop = null, exists = false } = {}) {
  const calls = []
  const restore = stubModules({
    '/models/Shop': { findOne: async () => shop, exists: async () => exists },
    '/core/cache': { del: async (k) => { calls.push(['cache.del', k]) } },
    '/core/syncQueue': { enqueue: async (kind, id) => { calls.push(['enqueue', kind, id]) } },
  })
  const service = freshRequire('services/system/shops.js')
  return { service, calls, restore }
}

const sub = { user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: {}, body: {}, params: {} }

test('connectedShop: 403 when a sub-admin has no access to the connected shop, 404 when there is none', async () => {
  let ctx = load({ shop: null, exists: true })
  try {
    await assert.rejects(ctx.service.connectedShop(sub, 'temu'), (e) => e.status === 403 && e.body.error === 'You do not have permission for this shop')
  } finally { ctx.restore() }
  ctx = load({ shop: null, exists: false })
  try {
    await assert.rejects(ctx.service.connectedShop(sub, 'temu'), (e) => e.status === 404 && e.body.error === 'No connected temu shop')
  } finally { ctx.restore() }
})

test('connectedShop returns the shop when there is one', async () => {
  const { service, restore } = load({ shop: { _id: 's1', marketplace: 'temu' } })
  try {
    assert.deepEqual(await service.connectedShop(sub, 'temu'), { _id: 's1', marketplace: 'temu' })
  } finally { restore() }
})

test("the shop list gives each shop its own listing capabilities (from the shop's app)", async () => {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
  const shops = [{ _id: 's1', name: 'eBay store', marketplace: 'ebay', status: 'connected' }, { _id: 's2', name: 'Temu store', marketplace: 'temu', status: 'connected' }]
  const caps = { ebay: { canList: true }, temu: { canList: false } }
  const registry = { KEYS: ['ebay', 'tiktok_shop', 'temu'], canonical: (v) => v, all: () => [], get: (key) => ({ app: { catalog: { capabilities: () => caps[key] } } }) }
  const restore = stubModules({ '/models/Shop': { find: () => chain(shops) }, '../../marketplaces': registry })
  try {
    const out = await freshRequire('services/system/shops.js').list({ user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} })
    assert.deepEqual(out.map((s) => [s.marketplace, s.listing]), [['ebay', { canList: true }], ['temu', { canList: false }]])
  } finally {
    restore()
  }
})
