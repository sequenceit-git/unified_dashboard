const test = require('node:test')
const assert = require('node:assert/strict')
const registry = require('../marketplaces')
const { newSku } = require('../utils/sku')

test('urlId gives the short id used in page links (?shop=…)', () => {
  assert.deepEqual(registry.KEYS.map(registry.urlId), ['ebay', 'tiktok', 'temu'])
  assert.equal(registry.canonical(registry.urlId('tiktok_shop')), 'tiktok_shop')
})

test('new SKUs carry the shop prefix, whichever spelling of the shop is given', () => {
  assert.match(newSku('ebay'), /^EBAY-\d{6}-[0-9A-F]{6}$/)
  assert.match(newSku('tiktok_shop'), /^TTS-/)
  assert.match(newSku('tiktok'), /^TTS-/)
  assert.match(newSku('temu'), /^TEMU-/)
  assert.match(newSku(undefined), /^EP-/)
})

test('eBay renames a draft SKU to EBAY-<item ID> after publishing; real SKUs are kept', () => {
  const { publishedSku } = registry.get('ebay').hooks
  for (const sku of ['BOT-1', 'EP-9', 'EBAY-261031-4F9A2C']) assert.equal(publishedSku({ sku }, { externalListingId: '123' }), 'EBAY-123')
  assert.equal(publishedSku({ sku: 'MY-SKU' }, { externalListingId: '123' }), null)
  assert.equal(publishedSku({ sku: 'BOT-1' }, {}), null)
  assert.equal(registry.get('tiktok_shop').hooks?.publishedSku, undefined)
})

test('only eBay has a buyer email fallback (username@members.ebay.com)', () => {
  assert.equal(registry.get('ebay').buyer.fallbackEmail('JoBuyer99'), 'jobuyer99@members.ebay.com')
  assert.equal(registry.get('tiktok_shop').buyer?.fallbackEmail, undefined)
  assert.equal(registry.get('temu').buyer?.fallbackEmail, undefined)
})

test('models accept every registry key and reject an unknown shop', () => {
  const Shop = require('../models/Shop')
  const User = require('../models/User')
  const ResearchReport = require('../models/ResearchReport')
  const cases = [
    [(m) => new Shop({ marketplace: m }), 'marketplace'],
    [(m) => new User({ marketplaces: [m] }), 'marketplaces.0'],
    [(m) => new ResearchReport({ opportunities: [{ listedShops: [m] }] }), 'opportunities.0.listedShops.0'],
  ]
  for (const [make, field] of cases) {
    for (const key of registry.KEYS) assert.equal(make(key).validateSync()?.errors?.[field], undefined, `${field} rejects ${key}`)
    assert.ok(make('amazon').validateSync()?.errors?.[field], `${field} accepts amazon`)
  }
})
