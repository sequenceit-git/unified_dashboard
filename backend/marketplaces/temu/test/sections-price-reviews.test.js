const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const USD = (a) => ({ amount: String(a), currency: 'USD' })
function load(calls) {
  return stubModules({
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }, { externalListingId: '77:2', productId: 'p1' }, { externalListingId: '88:5', productId: 'gone' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Phone case' }]),
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.local.goods.sku.list.price.query') return { openapiGoodsSupplierPriceDTOList: body.querySupplierPriceBaseList.map((g) => ({ goodsId: g.goodsId, openapiSkuSupplierPriceDTOList: g.skuIdList.map((id) => ({ skuId: id, supplierPrice: USD({ 1: 12, 2: 10, 5: 8 }[id]) })) })) }
        if (type === 'temu.local.goods.recommendedprice.query') return { goodsList: [{ goodsId: 77, skuList: [{ skuId: 1, recommendedSupplyPrice: USD(10) }, { skuId: 2, recommendedSupplyPrice: USD(10) }] }, { goodsId: 88, skuList: [{ skuId: 5, recommendedSupplyPrice: USD(10) }] }] }
        if (type === 'bg.local.goods.sku.list.query') return { skuList: [] } // nothing extra on Temu: listings only
        if (type === 'bg.local.goods.priceorder.query') return { list: [{ priceOrderId: 'PO1', goodsId: 77, status: 'PENDING' }] }
        if (type === 'bg.local.goods.list.query') return { goodsList: [] }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
}

test('each SKU shows current and recommended price', async () => {
  const calls = []
  const restore = load(calls)
  try {
    const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
    const { tables } = await prices('tok', { _id: 's1' })
    assert.deepEqual(tables.map((t) => [t.id, t.tab]), [['pricing', 'Price guide'], ['reviews', 'Price reviews'], ['catalog', 'Price reviews']])
    const rows = tables[0].rows
    assert.deepEqual(rows.map((r) => [r.skuId, r.current.value, r.recommended.value, r.difference]), [['1', 12, 10, 20], ['2', 10, 10, 0], ['5', 8, 10, -20]])
    assert.deepEqual(calls.find(([t]) => t === 'bg.local.goods.sku.list.price.query')[1].querySupplierPriceBaseList, [{ goodsId: 77, skuIdList: [1, 2] }, { goodsId: 88, skuIdList: [5] }])
    assert.deepEqual(calls.find(([t]) => t === 'temu.local.goods.recommendedprice.query')[1].goodsIdList, [77, 88])
  } finally { restore() }
})

test('unknown SKUs still show', async () => {
  const restore = load([])
  try {
    const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
    const rows = (await prices('tok', { _id: 's1' })).tables[0].rows
    assert.equal(rows.find((r) => r.skuId === '1').product, 'Phone case')
    assert.equal(rows.find((r) => r.skuId === '5').product, '')
  } finally { restore() }
})

test('a method not granted leaves the other tables loading', async () => {
  const calls = []
  const restore = load(calls)
  try {
    const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
    const { tables } = await prices('tok', { _id: 's1', grantedScopes: ['bg.local.goods.priceorder.query', 'bg.local.goods.list.query', 'bg.local.goods.sku.list.price.query'] })
    assert.match(tables[0].error, /temu\.local\.goods\.recommendedprice\.query/)
    assert.equal(tables[1].rows.length, 1)
    assert.ok(!calls.some(([t]) => t === 'temu.local.goods.recommendedprice.query'))
  } finally { restore() }
})

test('SKUs on Temu but not in the dashboard are in the price guide', async () => {
  const calls = []
  const restore = stubModules({
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Phone case' }]),
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.local.goods.sku.list.query') return { skuList: [{ goodsId: 77, skuId: 1 }, { goodsId: 77, skuId: 3 }] }
        if (type === 'bg.local.goods.sku.list.price.query') return { openapiGoodsSupplierPriceDTOList: body.querySupplierPriceBaseList.map((g) => ({ goodsId: g.goodsId, openapiSkuSupplierPriceDTOList: g.skuIdList.map((id) => ({ skuId: id, supplierPrice: USD(10) })) })) }
        if (type === 'temu.local.goods.recommendedprice.query') return { goodsList: [] }
        if (type === 'bg.local.goods.priceorder.query') return { list: [] }
        if (type === 'bg.local.goods.list.query') return { goodsList: [] }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
  try {
    const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
    const rows = (await prices('tok', { _id: 's1' })).tables[0].rows
    assert.deepEqual(rows.map((r) => [r.skuId, r.product]).sort(), [['1', 'Phone case'], ['3', '']])
  } finally { restore() }
})

test('the price guide reads SKUs with the newer SKU list when granted, the old one otherwise', async () => {
  const run = async (grantedScopes) => {
    const calls = []
    const restore = stubModules({
      '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }]),
      '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Phone case' }]),
      '../service': {
        call: async (type, body) => {
          calls.push(type)
          if (type === 'temu.local.sku.list.retrieve') return body.pageToken ? { skuList: [{ goodsId: '77', skuId: '3' }], pagination: {} } : { skuList: [{ goodsId: '77', skuId: '1' }], pagination: { nextToken: 'n2' } }
          if (type === 'bg.local.goods.sku.list.query') return { skuList: [{ goodsId: 77, skuId: 1 }] }
          if (type === 'bg.local.goods.sku.list.price.query') return { openapiGoodsSupplierPriceDTOList: body.querySupplierPriceBaseList.map((g) => ({ goodsId: g.goodsId, openapiSkuSupplierPriceDTOList: g.skuIdList.map((id) => ({ skuId: id, supplierPrice: USD(10) })) })) }
          if (type === 'temu.local.goods.recommendedprice.query') return { goodsList: [] }
          if (type === 'bg.local.goods.priceorder.query') return { list: [] }
          if (type === 'bg.local.goods.list.query') return { goodsList: [] }
          throw new Error(`unexpected ${type}`)
        },
      },
    })
    try {
      const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
      const rows = (await prices('tok', { _id: 's1', grantedScopes })).tables[0].rows
      return { calls, skus: rows.map((r) => r.skuId).sort() }
    } finally { restore() }
  }
  const granted = await run(undefined)
  assert.ok(granted.calls.includes('temu.local.sku.list.retrieve') && !granted.calls.includes('bg.local.goods.sku.list.query'))
  assert.deepEqual(granted.skus, ['1', '3'])
  const old = await run(['bg.local.goods.sku.list.query', 'bg.local.goods.sku.list.price.query', 'temu.local.goods.recommendedprice.query', 'bg.local.goods.priceorder.query', 'bg.local.goods.list.query'])
  assert.ok(!old.calls.includes('temu.local.sku.list.retrieve') && old.calls.includes('bg.local.goods.sku.list.query'))
})

test('on Temu US the price guide takes your price from the SKU list (the price query is not offered there)', async () => {
  const calls = []
  const granted = ['bg.local.goods.sku.list.query', 'temu.local.goods.recommendedprice.query', 'bg.local.goods.priceorder.query', 'bg.local.goods.list.query', 'temu.local.sku.list.retrieve']
  const restore = stubModules({
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Phone case' }]),
    '../service': {
      call: async (type) => {
        calls.push(type)
        if (type === 'bg.local.goods.sku.list.query') return { skuList: [{ goodsId: 77, skuId: 1, price: '12.00', currency: 'USD' }] }
        if (type === 'temu.local.goods.recommendedprice.query') return { goodsList: [{ goodsId: 77, skuList: [{ skuId: 1, recommendedSupplyPrice: USD(10) }] }] }
        if (type === 'bg.local.goods.priceorder.query') return { list: [] }
        if (type === 'bg.local.goods.list.query') return { goodsList: [] }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
  try {
    const prices = freshRequire('marketplaces/temu/sections/price-reviews.js')
    const t = (await prices('tok', { _id: 's1', grantedScopes: granted })).tables.find((x) => x.id === 'pricing')
    assert.equal(t.error, undefined)
    assert.deepEqual(t.rows.map((r) => [r.skuId, r.current?.value, r.recommended?.value, r.difference]), [['1', 12, 10, 20]])
    assert.ok(!calls.includes('bg.local.goods.sku.list.price.query'))
  } finally { restore() }
})
