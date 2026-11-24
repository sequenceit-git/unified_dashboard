const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

function load(probe) {
  const profile = { label: 'Shop', sections: [
    { id: 'orders', label: 'Orders', probe: async () => ({}) },
    { id: 'extra', label: 'Extra', needs: 'Extra API', hideWhenUnavailable: true, probe },
  ] }
  return stubModules({ '../../marketplaces': { all: () => [{ key: 'shopx', profile }], get: () => ({}) } })
}

test('a section the shop has not switched on is left out of the sidebar', async () => {
  const restore = load(async () => { throw Object.assign(new Error('Ads are not active for this shop'), { unavailable: true }) })
  try {
    const profiles = freshRequire('services/marketplace/profiles.js')
    const access = await profiles.probeSections('shopx', 'tok', {})
    assert.equal(access.extra.ok, false)
    const shop = { status: 'connected', apiAccess: access }
    assert.deepEqual(profiles.describe('shopx', shop).sections.map((s) => s.id), ['orders'])
    // Before the first check it still shows, and once it works it shows.
    assert.deepEqual(profiles.describe('shopx', { status: 'connected', apiAccess: {} }).sections.map((s) => s.id), ['orders', 'extra'])
    assert.deepEqual(profiles.describe('shopx', { status: 'connected', apiAccess: { extra: { ok: true } } }).sections.map((s) => s.id), ['orders', 'extra'])
  } finally { restore() }
})
