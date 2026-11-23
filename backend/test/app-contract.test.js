const test = require('node:test')
const assert = require('node:assert/strict')
const registry = require('../marketplaces')

test('every adapter exposes app with api, sync and catalog', () => {
  for (const key of registry.KEYS) {
    const adapter = registry.get(key)
    const { app } = adapter
    assert.ok(app, `${key} has an app`)
    assert.equal(typeof app.api, 'function', `${key} app.api is a router`)
    for (const job of ['orders', 'listings', 'access', 'full']) assert.equal(typeof app.sync[job], 'function', `${key} sync.${job}`)
    assert.equal(typeof app.sync.inbox === 'function', Boolean(adapter.capabilities?.inbox), `${key} sync.inbox iff it has an inbox`)
    for (const fn of ['publish', 'listingAction', 'capabilities', 'remember']) assert.equal(typeof app.catalog[fn], 'function', `${key} catalog.${fn}`)
    // Each shop's products are its own: nothing pushes into another shop's listings.
    for (const fn of ['pushStock', 'pushChanges', 'relist']) assert.equal(app.catalog[fn], undefined, `${key} has no catalog.${fn}`)
  }
})
