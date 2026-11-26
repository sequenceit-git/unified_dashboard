const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

function load({ listings, products, stock, calls }) {
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => listings),
    '/models/Product': modelStub(() => products),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (type, body) => { calls.push([type, body.goodsId]); return { stockList: stock(body.goodsId) } } },
  })
}
const admin = { user: { role: 'super_admin' }, params: {}, query: {}, body: {} }

test('stock is compared per SKU and mismatches come first', async () => {
  const calls = []
  const restore = load({
    calls,
    listings: [{ externalListingId: '77:1', productId: 'p1' }, { externalListingId: '77:2', productId: 'p1' }, { externalListingId: '88:5', productId: 'p2' }],
    products: [{ _id: 'p1', title: 'Case', sku: 'CASE', stock: 9, variants: [{ sku: 'CASE-RED', stock: 4 }, { sku: 'CASE-BLUE', stock: 5 }] }, { _id: 'p2', title: 'Cable', sku: 'CABLE', stock: 3, variants: [] }],
    stock: (goodsId) => [
      { goodsId: 77, skuStockInfoList: [{ skuId: 1, outSkuSn: 'CASE-RED', selfOrdinaryStock: { stock: 4 } }, { skuId: 2, outSkuSn: 'CASE-BLUE', selfOrdinaryStock: { stock: 9 }, selfPreSaleStock: { stock: 2 } }] },
      { goodsId: 88, skuStockInfoList: [{ skuId: 5, outSkuSn: 'CABLE', selfOrdinaryStock: { stock: 3 } }] },
    ].filter((g) => g.goodsId === goodsId),
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    const rows = await service.temuStock(admin)
    assert.deepEqual(rows.map((r) => [r.sku, r.goodsId, r.skuId, r.temuStock, r.dashboardStock, r.mismatch]), [
      ['2', '77', '2', 9, 5, true], ['1', '77', '1', 4, 4, false], ['5', '88', '5', 3, 3, false],
    ])
    assert.equal(rows[0].preSale, 2)
    assert.deepEqual(calls.map(([t]) => t), ['temu.local.goods.sku.stock.query', 'temu.local.goods.sku.stock.query'])
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

test('each listed goods is asked once, whatever its number of SKUs', async () => {
  const calls = []
  const listings = Array.from({ length: 120 }, (_, i) => ({ externalListingId: `${i % 3}:${i}`, productId: 'p' }))
  const restore = load({ calls, listings, products: [], stock: () => [] })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    await service.temuStock(admin)
    assert.equal(calls.length, 3)
  } finally { restore() }
})

test('SKUs that exist only on Temu still show', async () => {
  const calls = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Case', sku: 'CASE', stock: 4, variants: [] }]),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (type, body) => { calls.push(body); return { stockList: [{ goodsId: 77, skuStockInfoList: [{ skuId: 1, outSkuSn: 'CASE', selfOrdinaryStock: { stock: 4 } }, { skuId: 9, outSkuSn: 'CASE-NEW', selfOrdinaryStock: { stock: 7 } }] }] } } },
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    const rows = await service.temuStock(admin)
    assert.deepEqual(rows.map((r) => [r.sku, r.dashboardStock]), [['1', 4], ['9', null]])
    assert.equal(calls[0].goodsId, 77)
  } finally { restore() }
})

test('Use dashboard stock sends the dashboard number for that SKU to Temu', async () => {
  const sent = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => [{ externalListingId: '77:1', productId: 'p1' }, { externalListingId: '77:9', productId: 'p9' }]),
    '/models/Product': modelStub(() => [{ _id: 'p1', title: 'Case', sku: 'CASE', stock: 4, variants: [] }]),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': {
      call: async () => ({ stockList: [{ goodsId: 77, skuStockInfoList: [{ skuId: 1, outSkuSn: 'CASE', selfOrdinaryStock: { stock: 9 } }, { skuId: 3, outSkuSn: 'NEW', selfOrdinaryStock: { stock: 2 } }] }] }),
      updateStock: async (token, sku, quantity, opts) => { sent.push([quantity, opts.externalListingId]); return { success: true } },
    },
  })
  try {
    const service = freshRequire('marketplaces/temu/app/services/inventory.js')
    const res = await service.fixTemuStock({ ...admin, body: { goodsId: '77', skuId: '1' } })
    assert.deepEqual(sent, [[4, '77:1']])
    assert.match(res.message, /Temu now has 4/)
    // A SKU the dashboard doesn't hold has no dashboard number to send.
    await assert.rejects(service.fixTemuStock({ ...admin, body: { goodsId: '77', skuId: '3' } }), (e) => e.status === 400)
    await assert.rejects(service.fixTemuStock({ ...admin, body: { goodsId: 'x', skuId: '1' } }), (e) => e.status === 400)
  } finally { restore() }
})
