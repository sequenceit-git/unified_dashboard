const test = require('node:test')
const assert = require('node:assert/strict')
const { accessReport } = require('../scripts/accessRules')

test('lists every method the dashboard calls that the token does not allow, by feature', () => {
  const used = [
    { id: 'bg.local.goods.sku.list.price.query', files: ['marketplaces/temu/sections/price-reviews.js'] },
    { id: 'bg.local.goods.add', files: ['marketplaces/temu/listings.js'] },
    { id: 'temu.local.goods.brand.trademark.V2.get', files: ['marketplaces/temu/app/services/goodsHelpers.js'] },
    { id: 'bg.logistics.shipment.create', files: ['marketplaces/temu/app/services/labels.js'] },
    { id: 'temu.searchrec.ad.create', files: ['marketplaces/temu/sections/ads.js'] },
  ]
  const granted = ['bg.local.goods.add', 'bg.logistics.shipment.create']
  const r = accessReport(used, granted)
  assert.equal(r.used, 5)
  assert.equal(r.allowed, 2)
  assert.deepEqual(r.missing, [
    { feature: 'Ads', methods: ['temu.searchrec.ad.create'] },
    { feature: 'Goods & listing', methods: ['temu.local.goods.brand.trademark.V2.get'] },
    { feature: 'Price reviews', methods: ['bg.local.goods.sku.list.price.query'] },
  ])
})
