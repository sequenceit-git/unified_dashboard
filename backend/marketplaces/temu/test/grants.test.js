const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')
const { grantAware } = require('../sections/helpers')

const MSG = 'This needs "bg.order.detail.v2.get" enabled for the app in the Temu partner account, then reconnect the shop in Settings.'

test('a new connection stores the granted methods', async () => {
  const { TemuClient } = require('../client')
  const client = new TemuClient()
  const calls = []
  client.call = async (type) => { calls.push(type); return { accessToken: 'a', mallId: 9, apiScopeList: ['bg.order.list.v2.get', 'bg.local.goods.list.query'] } }
  const res = await client.exchangeCode('code')
  assert.deepEqual(res.grantedScopes, ['bg.order.list.v2.get', 'bg.local.goods.list.query'])
  assert.deepEqual(calls, ['bg.open.accesstoken.create'])
  // A reply without the list: ask Temu which methods the token has.
  client.call = async (type) => { calls.push(type); return type === 'bg.open.accesstoken.create' ? { accessToken: 'a', mallId: 9 } : { apiScopeList: ['x.y'] } }
  assert.deepEqual((await client.exchangeCode('code')).grantedScopes, ['x.y'])
  assert.equal(calls.at(-1), 'bg.open.accesstoken.info.get')
})

test('a method not granted gives the partner-account message', async () => {
  let called = false
  await assert.rejects(grantAware({ grantedScopes: ['bg.order.list.v2.get'] }, 'bg.order.detail.v2.get', async () => { called = true })(), { message: MSG })
  assert.equal(called, false)
  assert.deepEqual(await grantAware({ grantedScopes: ['bg.order.detail.v2.get'] }, 'bg.order.detail.v2.get', async () => [1])(), [1])
})

test('a shop without a granted list is not blocked', async () => {
  assert.equal(await grantAware({}, 'bg.order.detail.v2.get', async () => 'ok')(), 'ok')
  assert.equal(await grantAware({ grantedScopes: [] }, 'bg.order.detail.v2.get', async () => 'ok')(), 'ok')
})

test("refresh-permissions saves the token's list", async () => {
  const saved = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' }), { updateOne: async (q, u) => { saved.push([q, u]) } }),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (type, body) => { assert.equal(type, 'bg.open.accesstoken.info.get'); assert.equal(body.access_token, 'tok'); return { apiScopeList: ['a.b', 'c.d'] } } },
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/sections.js')
    const res = await service.refreshPermissions({ user: { role: 'super_admin' }, params: { id: 's1' }, query: {}, body: {} })
    assert.deepEqual(saved, [[{ _id: 's1' }, { grantedScopes: ['a.b', 'c.d'] }]])
    assert.equal(res.methods, 2)
  } finally { restore() }
})
