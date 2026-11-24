const test = require('node:test')
const assert = require('node:assert/strict')
const { CHECKS } = require('../scripts/checkList')
const { probeRequest } = require('../scripts/probeRules')

test('the health check only makes read-only calls, one or more per feature', () => {
  for (const c of CHECKS) assert.doesNotThrow(() => probeRequest([c.method]), c.method)
  const features = new Set(CHECKS.map((c) => c.feature))
  for (const f of ['Connection', 'Goods & listing', 'Inventory', 'Orders', 'Shipping & labels', 'Returns & refunds', 'Price reviews', 'Promotions', 'Ads', 'Analytics', 'Compliance']) assert.ok(features.has(f), f)
})
