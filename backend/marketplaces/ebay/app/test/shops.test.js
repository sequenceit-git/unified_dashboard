const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

function load({ shop = null, exists = false } = {}) {
  const calls = []
  const restore = stubModules({
    '/models/Shop': { findOne: async () => shop, exists: async () => exists },
    '/core/cache': { del: async (k) => { calls.push(['cache.del', k]) } },
    '/core/syncQueue': { enqueue: async (kind, id) => { calls.push(['enqueue', kind, id]) } },
  })
  const service = freshRequire('marketplaces/ebay/app/services/sections.js')
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

test('section and section actions run without undefined names (eBay)', async () => {
  const { service, restore } = load({ shop: null, exists: false })
  const admin = { user: { id: 'u1', role: 'super_admin' }, allowedShopIds: [], query: {}, body: {}, params: {} }
  try {
    const calls = [
      service.section({ ...admin, params: { sectionId: 'returns' }, query: { marketplace: 'ebay' } }),
      service.sendOffer({ ...admin, body: { marketplace: 'ebay' } }),
      service.decideReturn({ ...admin, body: { marketplace: 'ebay', returnId: 'r1' } }),
      service.decideCancellation({ ...admin, body: { marketplace: 'ebay', cancelId: 'c1' } }),
      service.createPromotion({ ...admin, body: { marketplace: 'ebay' } }),
      service.shipPackage({ ...admin, params: { packageId: 'p1' }, body: {} }),
    ]
    for (const call of calls) {
      await assert.rejects(call, (e) => !(e instanceof ReferenceError), 'must not be a ReferenceError')
    }
  } finally { restore() }
})
