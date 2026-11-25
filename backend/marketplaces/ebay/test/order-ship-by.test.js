const test = require('node:test')
const assert = require('node:assert/strict')
const { freshRequire } = require('../../../test/helpers/stub')

test("eBay's ship-by date: the earliest line item shipByDate", () => {
  const { ebayShipBy } = freshRequire('marketplaces/ebay/hooks.js')
  assert.equal(ebayShipBy({ lineItems: [
    { lineItemFulfillmentInstructions: { shipByDate: '2026-11-28T07:59:59.000Z' } },
    { lineItemFulfillmentInstructions: { shipByDate: '2026-11-27T07:59:59.000Z' } },
    { lineItemFulfillmentInstructions: {} },
  ] }).toISOString(), '2026-11-27T07:59:59.000Z')
  assert.equal(ebayShipBy({ lineItems: [{}] }), undefined)
  assert.equal(ebayShipBy({}), undefined)
})
