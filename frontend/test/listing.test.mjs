import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import frozen from './__snapshots__/listing-validators.json' with { type: 'json' }

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('eBay listing validators give the same messages after moving into the eBay products section', async () => {
  const rules = await load('/src/marketplaces/ebay/sections/products/listing/rules.js')
  for (const [variants, strict, loose] of frozen.ebay) {
    assert.deepEqual(rules.validateVariantsForEbay(variants), strict)
    assert.deepEqual(rules.validateVariantsForEbay(variants, { requireStock: false }), loose)
  }
  for (const [bestOffer, min, expected] of frozen.bestOffer) assert.deepEqual(rules.validateBestOffer(bestOffer, min), expected)
  for (const [id, expected] of frozen.ebayId) assert.deepEqual(rules.validateEbayIdentifierCode(id), expected)
})

test('TikTok listing validators give the same messages after moving into the TikTok Shop products section', async () => {
  const rules = await load('/src/marketplaces/tiktok_shop/sections/products/listing/rules.js')
  for (const [variants, strict, loose] of frozen.tiktok) {
    assert.deepEqual(rules.validateVariantsForTikTok(variants), strict)
    assert.deepEqual(rules.validateVariantsForTikTok(variants, { requireStock: false }), loose)
  }
  for (const [id, expected] of frozen.ttId) assert.deepEqual(rules.validateIdentifierCode(id), expected)
})

test('each shop registers a page for every section in its sidebar, and its own List dialog', async () => {
  const { SHOPS } = await load('/src/marketplaces/index.js')
  for (const shop of SHOPS) {
    assert.deepEqual(Object.keys(shop.pages).sort(), shop.subsections.map((section) => section.id).sort(), shop.key)
    assert.ok(shop.ListModal, `${shop.key} has a List dialog`)
  }
})
