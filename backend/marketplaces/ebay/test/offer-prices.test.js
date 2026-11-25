const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const seenListing = []
function load() {
  return stubModules({
    '/models/Listing': modelStub((q) => { seenListing.push(q); return [{ externalListingId: '111', productId: 'p1', price: 20 }, { externalListingId: 'item-222', productId: 'p2', price: 0 }] }),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Phone case', sku: 'PC-1', costPrice: 8 }, { _id: 'p2', title: 'Mug', sku: 'MUG', basePrice: 12 }]),
    '../trading': { getBestOffers: async () => [{ itemId: '111', offerId: 'o1', buyer: 'jo', price: { value: 16.4, currency: 'USD' }, quantity: 1, expires: '2026-11-26T10:00:00Z' }] },
    './helpers': { ebayGet: async () => ({ eligibleItems: [{ listingId: '222' }] }) },
  })
}

test('offers carry your price, cost and how far below your price the offer is', async () => {
  const restore = load()
  try {
    const offers = freshRequire('marketplaces/ebay/sections/offers.js')
    const { tables, summary } = await offers('tok', { _id: 's1' })
    assert.ok(seenListing.every((q) => q.shopId === 's1'), 'only the connected shop')
    const [o] = tables[0].rows
    assert.deepEqual([o.listPrice.value, o.cost.value, o.belowPrice], [20, 8, 18])
    const [e] = tables[1].rows
    assert.deepEqual([e.title, e.sku, e.listPrice.value, e.cost], ['Mug', 'MUG', 12, null])
    assert.equal(summary[0].value, 1)
  } finally { restore() }
})
