const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

// Temu's enums (guide: product listing): bg.* lists take numbers (1 = ALL), temu.local.* lists take text ("ALL").
function run() {
  const bodies = {}
  const restore = stubModules({
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Case' }]),
    '/models/Order': modelStub(() => null, { countDocuments: async () => 0 }),
    '../service': {
      call: async (type, body) => {
        bodies[type] = body
        if (type === 'temu.local.sku.list.retrieve' || type === 'bg.local.goods.sku.list.query') return { skuList: [{ goodsId: 77, skuId: 1, price: '10', currency: 'USD' }], pagination: {} }
        if (type === 'temu.local.goods.list.retrieve') return { goodsList: [], pagination: {} }
        return {}
      },
    },
  })
  return { bodies, restore }
}

test('the old SKU list gets skuSearchType 1, the newer lists get "ALL"', async () => {
  const a = run()
  try {
    await freshRequire('marketplaces/temu/sections/price-reviews.js')('tok', { _id: 's1', grantedScopes: ['bg.local.goods.sku.list.query', 'temu.local.goods.recommendedprice.query', 'temu.local.sku.list.retrieve'] })
    assert.equal(a.bodies['bg.local.goods.sku.list.query'].skuSearchType, 1)
  } finally { a.restore() }
  const b = run()
  try {
    await freshRequire('marketplaces/temu/sections/price-reviews.js')('tok', { _id: 's1' })
    assert.equal(b.bodies['temu.local.sku.list.retrieve'].skuSearchType, 'ALL')
    await freshRequire('marketplaces/temu/sections/analytics.js')('tok', { _id: 's1' })
    assert.equal(b.bodies['temu.local.goods.list.retrieve'].goodsSearchType, 'ALL')
  } finally { b.restore() }
})
