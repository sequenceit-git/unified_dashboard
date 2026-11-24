const test = require('node:test')
const assert = require('node:assert/strict')
const { tokenUpdate } = require('../scripts/tokenRules')

test("a manual token is saved only for the shop's own mall, with its expiry and allowed methods", () => {
  const info = { mallId: 6345, expiredTime: 1795000000, apiScopeList: ['bg.order.list.v2.get', 'bg.local.goods.sku.list.price.query'] }
  const u = tokenUpdate({ externalShopId: '6345' }, 'tok-abc', info)
  assert.deepEqual(u, {
    'auth.accessTokenEnc': 'tok-abc',
    'auth.expiresAt': new Date(1795000000 * 1000),
    grantedScopes: ['bg.order.list.v2.get', 'bg.local.goods.sku.list.price.query'],
    status: 'connected',
    authError: null,
  })
  assert.throws(() => tokenUpdate({ externalShopId: '9999' }, 'tok-abc', info), /belongs to Temu mall 6345, not this shop \(9999\)/)
  assert.throws(() => tokenUpdate({ externalShopId: '6345' }, ' ', info), /Paste the access token/)
  assert.throws(() => tokenUpdate({ externalShopId: '6345' }, 'tok', {}), /did not recognise/)
  // Expiry in milliseconds is read as milliseconds.
  assert.deepEqual(tokenUpdate({ externalShopId: '6345' }, 'tok', { ...info, expiredTime: 1795000000000 })['auth.expiresAt'], new Date(1795000000000))
})
