const test = require('node:test')
const assert = require('node:assert/strict')

for (const [shop, max] of [['ebay', 80], ['tiktok_shop', 255], ['temu', 250]]) {
  test(`${shop}: reading a page asks for this shop's title rules, weight and size`, () => {
    const { aiFields } = require(`../marketplaces/${shop}/app/services/productImport`)
    const { RULES } = require(`../marketplaces/${shop}/researchListing`)
    const fields = aiFields(shop)
    assert.ok(fields.includes(RULES), 'the shop title rules')
    assert.match(fields, new RegExp(`at most ${max}`))
    assert.match(fields, /"weight"/)
    assert.match(fields, /"dimensions"/)
  })

  test(`${shop}: the page's weight and size become pounds and inches`, () => {
    const { draftMeasurements } = require(`../marketplaces/${shop}/app/services/productImport`)
    assert.deepEqual(draftMeasurements({ weight: '500 g', dimensions: '20 x 10 x 5 cm' }, {}), { weight: 1.1, dimensions: { length: 7.9, width: 3.9, height: 2 } })
    assert.deepEqual(draftMeasurements({}, { 'Item Weight': '12 oz' }), { weight: 0.8 })
    assert.deepEqual(draftMeasurements(null, {}), {})
  })
}
