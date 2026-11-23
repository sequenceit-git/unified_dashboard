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
