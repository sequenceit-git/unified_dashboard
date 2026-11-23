const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { execFileSync } = require('child_process')

const BACKEND = path.join(__dirname, '..')
const registry = require('../marketplaces')
const { checkAdapter, REQUIRED } = require('../marketplaces/contract')

test('KEYS are ebay, tiktok_shop, temu', () => {
  assert.deepEqual(registry.KEYS, ['ebay', 'tiktok_shop', 'temu'])
})

test('get throws for unknown key', () => {
  assert.throws(() => registry.get('amazon'), /Unknown marketplace amazon/)
})

test('every adapter passes checkAdapter', () => {
  for (const adapter of registry.all()) assert.deepEqual(checkAdapter(adapter), [], adapter.key)
  assert.doesNotThrow(() => registry.assertAdapters())
})

test('checkAdapter reports missing required, ignores optional', () => {
  assert.deepEqual(REQUIRED, ['key', 'label', 'config', 'service', 'profile', 'sections'])
  assert.deepEqual(checkAdapter({ key: 'x' }), ['label', 'config', 'service', 'profile', 'sections'])
  const full = { key: 'x', label: 'X', config: {}, service: {}, profile: {}, sections: {} }
  assert.deepEqual(checkAdapter({ ...full, webhooks: undefined, hooks: undefined }), [])
})

test('labels come from the adapters', () => {
  assert.deepEqual(Object.keys(registry.labels()), ['ebay', 'tiktok_shop', 'temu'])
})

test('each adapter loads in a fresh process', () => {
  for (const key of registry.KEYS) {
    execFileSync(process.execPath, ['-e', `const a=require('./marketplaces').get('${key}'); const s=a.service; if(typeof s.getOrders!=='function') process.exit(1)`], { cwd: BACKEND, stdio: 'pipe' })
  }
})

test('canonical maps all/empty/null to null, tiktok to tiktok_shop, unknown to null', () => {
  assert.equal(registry.canonical('all'), null)
  assert.equal(registry.canonical(''), null)
  assert.equal(registry.canonical(null), null)
  assert.equal(registry.canonical('tiktok'), 'tiktok_shop')
  assert.equal(registry.canonical('tiktok_shop'), 'tiktok_shop')
  assert.equal(registry.canonical('ebay'), 'ebay')
  assert.equal(registry.canonical('temu'), 'temu')
  assert.equal(registry.canonical('foo'), null)
})
