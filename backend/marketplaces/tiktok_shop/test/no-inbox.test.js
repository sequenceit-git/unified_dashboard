const test = require('node:test')
const assert = require('node:assert/strict')

// The shop's TikTok app is an E-commerce connector: no Customer Service or Affiliate Seller scope.
test('TikTok has no inbox sync, inbox capability or message webhooks', () => {
  const adapter = require('..')
  assert.equal(adapter.app.sync.inbox, undefined)
  assert.notEqual(adapter.capabilities.inbox, true)
  assert.equal(adapter.renamedSections.inbox, undefined)
  assert.equal(adapter.sections.creators, undefined)
  const { EVENTS } = require('../webhooks')
  assert.ok(!Object.keys(EVENTS || {}).some((e) => /MESSAGE|CONVERSATION/.test(e)))
})
