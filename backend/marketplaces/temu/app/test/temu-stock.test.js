const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

function load({ listings, products, stock, calls }) {
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => listings),
    '/models/Product': modelStub(() => products),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (type, body) => { calls.push([type, body.skuIdList.length]); return { stockList: stock(body.skuIdList) } } },
  })
}
const admin = { user: { role: 'super_admin' }, params: {}, query: {}, body: {} }

test('stock is compared per SKU and mismatches come first', async () => {
  const calls = []
  const restore = load({
    calls,
    listings: [{ externalListingId: '77:1', productId: 'p1' }, { externalListingId: '77:2', productId: 'p1' }, { externalListingId: '88:5', productId: 'p2' }],
    products: [{ _id: 'p1', title: 'Case', sku: 'CASE', stock: 9, variants: [{ sku: 'CASE-RED', stock: 4 }, { sku: 'CASE-BLUE', stock: 5 }] }, { _id: 'p2', title: 'Cable', sku: 'CABLE', stock: 3, variants: [] }],
    stock: () => [
      { goodsId: 77, skuStockInfoList: [{ skuId: 1, outSkuSn: 'CASE-RED', selfOrdinaryStock: { stock: 4 } }, { skuId: 2, outSkuSn: 'CASE-BLUE', selfOrdinaryStock: { stock: 9 }, selfPreSaleStock: { stock: 2 } }] },
      { goodsId: 88, skuStockInfoList: [{ skuId: 5, outSkuSn: 'CABLE', selfOrdinaryStock: { stock: 3 } }] },
    ],
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    const rows = await service.temuStock(admin)
    assert.deepEqual(rows.map((r) => [r.sku, r.goodsId, r.skuId, r.temuStock, r.dashboardStock, r.mismatch]), [
      ['CASE-BLUE', '77', '2', 9, 5, true], ['CASE-RED', '77', '1', 4, 4, false], ['CABLE', '88', '5', 3, 3, false],
    ])
    assert.equal(rows[0].preSale, 2)
    assert.deepEqual(calls, [['temu.local.goods.sku.stock.query', 3]])
  } finally { restore() }
})

test('unknown SKUs still show', async () => {
  const calls = []
  const restore = load({
    calls,
    listings: [{ externalListingId: '77:1', productId: 'gone' }],
    products: [],
    stock: () => [{ goodsId: 77, skuStockInfoList: [{ skuId: 1, outSkuSn: '', selfOrdinaryStock: { stock: 6 } }] }],
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    const [row] = await service.temuStock(admin)
    assert.deepEqual([row.sku, row.temuStock, row.dashboardStock, row.mismatch, row.product], ['1', 6, null, false, ''])
  } finally { restore() }
})

test('more than 50 SKUs are asked in batches of 50', async () => {
  const calls = []
  const listings = Array.from({ length: 120 }, (_, i) => ({ externalListingId: `77:${i}`, productId: 'p' }))
  const restore = load({ calls, listings, products: [], stock: () => [] })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    await service.temuStock(admin)
    assert.deepEqual(calls.map(([, n]) => n), [50, 50, 20])
  } finally { restore() }
})
