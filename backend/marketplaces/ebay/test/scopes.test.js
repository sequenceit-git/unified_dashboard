const test = require('node:test')
const assert = require('node:assert/strict')
const { freshRequire } = require('../../../test/helpers/stub')

const NEW = ['sell.analytics.readonly', 'sell.finances.earnings.read', 'sell.payment.dispute', 'commerce.feedback']
const FULL = (s) => `https://api.ebay.com/oauth/api_scope/${s}`

function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'EBAY_EXTRA_SCOPES')
  const old = process.env.EBAY_EXTRA_SCOPES
  if (value === undefined) delete process.env.EBAY_EXTRA_SCOPES
  else process.env.EBAY_EXTRA_SCOPES = value
  try { return fn() } finally { if (had) process.env.EBAY_EXTRA_SCOPES = old; else delete process.env.EBAY_EXTRA_SCOPES }
}

test('the consent link asks for the four new scopes', () => withEnv(undefined, () => {
  const { EbayClient } = freshRequire('marketplaces/ebay/client.js')
  const scope = decodeURIComponent(new URL(new EbayClient().getAuthUrl('s')).searchParams.get('scope'))
  for (const s of NEW) assert.ok(scope.split(' ').includes(FULL(s)), s)
}))

test('extra scopes can be switched off without a deploy', () => withEnv('', () => {
  const config = freshRequire('marketplaces/ebay/config.js')
  assert.equal(config.scopes.length, 6)
  assert.deepEqual(config.extraScopes, [])
}))

test('a new connection records the scopes it asked for', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 7200 }) })
  try {
    await withEnv(undefined, async () => {
      const config = freshRequire('marketplaces/ebay/config.js')
      config.clientId = 'id'; config.clientSecret = 'secret'
      const { EbayClient } = require('../client')
      const result = await new EbayClient().exchangeCode('code')
      assert.equal(result.access_token, 'a')
      assert.deepEqual(result.grantedScopes, config.scopes)
    })
  } finally { global.fetch = realFetch }
})

test('an older shop is told what a reconnect turns on', () => withEnv(undefined, () => {
  freshRequire('marketplaces/ebay/config.js')
  const adapter = require('..')
  assert.deepEqual(adapter.missingScopes({ grantedScopes: [] }).map((m) => m.feature), ['Listing traffic and seller level', 'Order earnings', 'Payment disputes', 'Feedback'])
  const config = require('../config')
  assert.deepEqual(adapter.missingScopes({ grantedScopes: config.scopes }), [])
  const { describe } = freshRequire('services/marketplace/profiles.js')
  assert.equal(describe('ebay', { status: 'connected', grantedScopes: [] }).missingScopes.length, 4)
}))
