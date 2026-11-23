const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { usedEndpoints, normalizeId } = require('../scripts/apiCoverage/used')

const ROOT = path.join(__dirname, '..')

test('the extractor finds known calls', () => {
  const ids = (key) => usedEndpoints(key).map((e) => e.id)
  assert.ok(ids('ebay').includes('Trading:GetItem'))
  assert.ok(ids('ebay').some((id) => id.endsWith(' /commerce/message/v1/send_message')))
  assert.ok(ids('tiktok_shop').some((id) => id.endsWith(' /analytics/202405/shop_products/performance')))
  assert.ok(ids('temu').includes('bg.aftersales.cancel.agree'))
  for (const key of ['ebay', 'tiktok_shop', 'temu']) {
    const list = usedEndpoints(key)
    assert.equal(new Set(list.map((e) => e.id)).size, list.length, `${key} ids are unique`)
    for (const e of list) for (const f of e.files) assert.ok(fs.existsSync(path.join(ROOT, f)), f)
  }
})

test('path parameters match whatever their names', () => {
  assert.equal(normalizeId('GET /sell/fulfillment/v1/order/{orderId}'), normalizeId('get /sell/fulfillment/v1/order/{order_id}'))
})
