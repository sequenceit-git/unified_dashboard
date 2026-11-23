const test = require('node:test')
const assert = require('node:assert/strict')
const frozen = require('./__snapshots__/listing-urls.json')

test('listingUrl gives the same URL for every shop, id, saved value and status as before', () => {
  const { listingUrl } = require('../marketplaces')
  for (const [marketplace, id, saved, status, expected] of frozen.cases) {
    assert.equal(listingUrl(marketplace, id, saved, { status }), expected, JSON.stringify([marketplace, id, saved, status]))
  }
})

test('ebaySku keeps its rules after moving into marketplaces/ebay', () => {
  const { ebaySku } = require('../marketplaces/ebay/sku')
  for (const [raw, itemId, expected] of frozen.skus) assert.equal(ebaySku(raw, itemId), expected)
})
