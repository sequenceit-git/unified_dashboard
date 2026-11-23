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
  assert.equal(normalizeId('GET /commerce/taxonomy/v1/category_tree/0/x'), normalizeId('GET /commerce/taxonomy/v1/category_tree/{category_tree_id}/x'))
})

const CATALOG_DIR = path.join(ROOT, '..', 'docs', 'api-coverage', 'catalog')
const pathOf = (id) => normalizeId(id).replace(/^[A-Z]+ /, '').replace(/\/20\d{4}\//, '/{v}/')

for (const key of ['ebay', 'tiktok_shop', 'temu']) {
  test(`catalog ${key} is well formed`, (t) => {
    const file = path.join(CATALOG_DIR, `${key}.json`)
    if (key !== 'ebay' && !fs.existsSync(file)) return t.skip('not researched yet')
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(catalog.shop, key)
    assert.ok(Array.isArray(catalog.sources) && catalog.sources.length > 0 && catalog.sources.every((u) => /^https:\/\//.test(u)))
    assert.ok(!Number.isNaN(Date.parse(catalog.researchedAt)))
    const ids = catalog.endpoints.map((e) => e.id)
    assert.equal(new Set(ids).size, ids.length, 'unique ids')
    for (const e of catalog.endpoints) {
      for (const field of ['id', 'group', 'name', 'summary']) assert.ok(typeof e[field] === 'string' && e[field].length, `${e.id} ${field}`)
      assert.equal(typeof e.sellerFacing, 'boolean', `${e.id} sellerFacing`)
      assert.equal(typeof e.confirmed, 'boolean', `${e.id} confirmed`)
    }
  })

  test(`the catalog lists every endpoint we call (${key})`, (t) => {
    const file = path.join(CATALOG_DIR, `${key}.json`)
    if (key !== 'ebay' && !fs.existsSync(file)) return t.skip('not researched yet')
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Matched by path (method guesses at call sites aren't reliable) and, for TikTok, any version.
    const known = new Set(catalog.endpoints.map((e) => pathOf(e.id)))
    const missing = usedEndpoints(key).map((e) => e.id).filter((id) => !known.has(pathOf(id)))
    assert.deepEqual(missing, [])
  })
}
