import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import frozen from './__snapshots__/listing-validators.json' with { type: 'json' }

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('eBay listing validators give the same messages after moving into marketplaces/ebay', async () => {
  const rules = await load('/src/marketplaces/ebay/listing/rules.js')
  for (const [variants, strict, loose] of frozen.ebay) {
    assert.deepEqual(rules.validateVariantsForEbay(variants), strict)
    assert.deepEqual(rules.validateVariantsForEbay(variants, { requireStock: false }), loose)
  }
  for (const [bestOffer, min, expected] of frozen.bestOffer) assert.deepEqual(rules.validateBestOffer(bestOffer, min), expected)
  for (const [id, expected] of frozen.ebayId) assert.deepEqual(rules.validateEbayIdentifierCode(id), expected)
})

test('TikTok listing validators give the same messages after moving into marketplaces/tiktok_shop', async () => {
  const rules = await load('/src/marketplaces/tiktok_shop/listing/rules.js')
  for (const [variants, strict, loose] of frozen.tiktok) {
    assert.deepEqual(rules.validateVariantsForTikTok(variants), strict)
    assert.deepEqual(rules.validateVariantsForTikTok(variants, { requireStock: false }), loose)
  }
  for (const [id, expected] of frozen.ttId) assert.deepEqual(rules.validateIdentifierCode(id), expected)
})

test('each shop declares its listing field set and validator', async () => {
  const { getShop } = await load('/src/marketplaces/index.js')
  const ebayRules = await load('/src/marketplaces/ebay/listing/rules.js')
  const ttRules = await load('/src/marketplaces/tiktok_shop/listing/rules.js')
  assert.equal(getShop('ebay').listing.ebayFields, true)
  assert.equal(getShop('ebay').listing.validateVariants, ebayRules.validateVariantsForEbay)
  assert.equal(getShop('tiktok_shop').listing.tiktokFields, true)
  assert.equal(getShop('tiktok_shop').listing.validateVariants, ttRules.validateVariantsForTikTok)
  assert.equal(getShop('temu').listing.temuFields, true)
})
