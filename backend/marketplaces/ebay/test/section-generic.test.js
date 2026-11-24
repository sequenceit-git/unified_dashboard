const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

function load({ deleted = [], tokenCalls = [] } = {}) {
  const thing = Object.assign(async () => ({ tables: [] }), {
    details: { thing: async (token, shop, id) => ({ title: `Thing ${id}`, tables: [] }) },
    actions: {
      boom: async () => { throw Object.assign(new Error('eBay said no'), { status: 400 }) },
      ok: async (token, shop, id, value) => ({ message: `done ${id} ${value}` }),
    },
  })
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'ebay', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => { tokenCalls.push(1); return fn('SECRET') } },
    '/services/core/cache': { get: async () => undefined, set: async () => {}, del: async (k) => { deleted.push(k) } },
    '../../sections': { returns: thing },
    '/services/marketplace/profiles': { PROFILES: { ebay: { sections: [{ id: 'returns', label: 'Returns', route: 'orders' }] } } },
  })
}
const admin = (actionId, extra = {}) => ({ user: { role: 'super_admin' }, params: { sectionId: 'returns', actionId }, query: { id: '7' }, body: { id: '7', value: 'x' }, ...extra })

test('a section detail runs the section\'s own detail', async () => {
  const restore = load()
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    assert.deepEqual(await service.sectionDetail(admin('thing')), { title: 'Thing 7', tables: [] })
    assert.deepEqual(await service.sectionAction(admin('ok')), { message: 'done 7 x' })
  } finally { restore() }
})

test('names from Object.prototype are 404 and never call eBay', async () => {
  const tokenCalls = []
  const restore = load({ tokenCalls })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      await assert.rejects(service.sectionDetail(admin(name)), (e) => e.status === 404, name)
      await assert.rejects(service.sectionAction(admin(name)), (e) => e.status === 404, name)
    }
    assert.equal(tokenCalls.length, 0)
  } finally { restore() }
})

test('an action clears the section cache even when it fails', async () => {
  const deleted = []
  const restore = load({ deleted })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    await assert.rejects(service.sectionAction(admin('boom')), /eBay said no/)
    assert.deepEqual(deleted, ['shop:s1:section:returns'])
  } finally { restore() }
})

test('a sub-admin without the section gets 403', async () => {
  const tokenCalls = []
  const restore = load({ tokenCalls })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    const sub = admin('thing', { user: { role: 'sub_admin', mainRoutes: ['orders'], allowedSections: ['ebay:payouts'] }, allowedShopIds: ['s1'] })
    await assert.rejects(service.sectionDetail(sub), (e) => e.status === 403)
    await assert.rejects(service.sectionAction({ ...sub, params: { sectionId: 'returns', actionId: 'ok' } }), (e) => e.status === 403)
    assert.equal(tokenCalls.length, 0)
  } finally { restore() }
})

test("an eBay 401 never reaches the browser as the dashboard's own 401", async () => {
  const express = require('express')
  const restore = stubModules({
    '/middleware/auth': { requireAuth: (q, r, n) => { q.user = { role: 'super_admin' }; n() }, loadAccess: (q, r, n) => n(), canUseSection: () => true },
    '/middleware/shopScope': { onlyShop: () => (q, r, n) => n() },
    '../services/sections': { sectionAction: async () => { throw Object.assign(new Error('Invalid access token'), { status: 401 }) }, sectionDetail: async () => { throw Object.assign(new Error('Invalid access token'), { status: 401 }) } },
  })
  try {
    const { sectionsRoutes } = freshRequire('marketplaces/ebay/app/routes/sections.js')
    const app = express().use(express.json()).use('/s', (sectionsRoutes || freshRequire('marketplaces/ebay/app/routes/sections.js'))('ebay'))
    const server = app.listen(0)
    try {
      const base = `http://127.0.0.1:${server.address().port}/s/returns/x`
      const post = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const get = await fetch(`${base}?id=1`)
      assert.notEqual(post.status, 401)
      assert.notEqual(get.status, 401)
      assert.match((await post.json()).error, /Reconnect eBay|access token/i)
    } finally { server.close() }
  } finally { restore() }
})
