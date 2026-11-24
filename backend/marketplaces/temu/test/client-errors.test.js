const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

/** The Temu client with a fake config and a fake Temu reply. */
async function callWith(reply) {
  const restore = stubModules({ './config': { appKey: 'k', appSecret: 's', apiBaseUrl: 'https://temu.test/openapi/router' } })
  const real = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => reply })
  try {
    const { TemuClient } = freshRequire('marketplaces/temu/client.js')
    return await new TemuClient().call('bg.order.list.v2.get', { access_token: 't' })
  } finally { global.fetch = real; restore() }
}

test('a server IP Temu has not allowed says how to fix it', async () => {
  await assert.rejects(callWith({ success: false, errorCode: 7000016, errorMsg: 'NOT_IN_IP_WHITE_LIST' }), (e) => {
    assert.equal(e.code, 7000016)
    assert.equal(e.ipBlocked, true)
    assert.match(e.message, /^Temu blocked this server's IP \(NOT_IN_IP_WHITE_LIST\)\. Add the server's public IP to your app's IP whitelist in the Temu Partner Platform\.$/)
    assert.ok(e.message.length <= 150, 'fits the sync-failed notification (180 characters with its prefix)')
    return true
  })
})

test('other Temu errors keep their own message', async () => {
  await assert.rejects(callWith({ success: false, errorCode: 1, errorMsg: 'parameter is illegal' }), (e) => e.message === 'parameter is illegal' && !e.ipBlocked)
})

test('Temu Ads not active for the shop says how to switch it on', async () => {
  await assert.rejects(callWith({ success: false, errorCode: 230016701, errorMsg: 'has no permission' }), (e) => {
    assert.equal(e.adsInactive, true)
    assert.match(e.message, /^Temu Ads isn't active for this shop/)
    return true
  })
})
