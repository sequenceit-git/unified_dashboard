const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

function load({ listings, products, inventory, calls, updates = [] }) {
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '/models/Listing': modelStub(() => listings),
    '/models/Product': modelStub(() => products),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (token, method, path, opts) => { calls.push([method, path, opts.body.product_ids.length]); return { inventory: inventory(opts.body.product_ids) } },
      updateStock: async (token, sku, qty, opts) => { updates.push([qty, opts.externalListingId]) } },
  })
}
const admin = { user: { role: 'super_admin' }, params: {}, query: {}, body: {} }

test('stock is compared per SKU and mismatches come first', async () => {
  const calls = []
  const restore = load({
    calls,
    listings: [{ externalListingId: '100', productId: 'p1' }, { externalListingId: '200', productId: 'p2' }],
    products: [
      { _id: 'p1', title: 'Case', sku: 'CASE', stock: 5, variants: [{ sku: 'CASE-RED', stock: 3 }, { sku: 'CASE-BLUE', stock: 2 }] },
      { _id: 'p2', title: 'Cable', sku: 'CABLE', stock: 10, variants: [] },
    ],
    inventory: () => [
      { product_id: '100', skus: [
        { id: 's1', seller_sku: 'CASE-RED', total_available_quantity: 3, warehouse_inventory: [{ warehouse_id: 'W1', available_quantity: 3 }] },
        { id: 's2', seller_sku: 'CASE-BLUE', total_available_quantity: 7, warehouse_inventory: [{ warehouse_id: 'W1', available_quantity: 4 }, { warehouse_id: 'W2', available_quantity: 3 }] },
      ] },
      { product_id: '200', skus: [{ id: 's3', seller_sku: 'CABLE', total_available_quantity: 10, warehouse_inventory: [] }] },
      { product_id: '300', skus: [{ id: 's4', seller_sku: 'GHOST', total_available_quantity: 1, warehouse_inventory: [] }] },
    ],
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/inventory.js')
    const rows = await service.tiktokStock(admin)
    assert.deepEqual(rows.map((r) => [r.sku, r.tiktokTotal, r.dashboardStock, r.mismatch]), [
      ['CASE-BLUE', 7, 2, true], ['CASE-RED', 3, 3, false], ['CABLE', 10, 10, false], ['GHOST', 1, null, false],
    ])
    assert.deepEqual(rows[0].warehouses, [{ name: 'W1', available: 4 }, { name: 'W2', available: 3 }])
    assert.equal(rows[0].product, 'Case')
  } finally { restore() }
})

test('more than 50 products are fetched in pages of 50', async () => {
  const calls = []
  const listings = Array.from({ length: 120 }, (_, i) => ({ externalListingId: String(i), productId: `p${i}` }))
  const restore = load({ calls, listings, products: [], inventory: () => [] })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/inventory.js')
    await service.tiktokStock(admin)
    assert.deepEqual(calls, [['POST', '/product/202309/inventory/search', 50], ['POST', '/product/202309/inventory/search', 50], ['POST', '/product/202309/inventory/search', 20]])
  } finally { restore() }
})

test('"Use dashboard stock" sends the dashboard\'s number for that one TikTok SKU', async () => {
  const updates = []
  const restore = load({
    calls: [], updates,
    listings: [{ externalListingId: '100', productId: 'p1' }],
    products: [{ _id: 'p1', title: 'Case', sku: 'CASE', stock: 5, variants: [{ sku: 'CASE-RED', stock: 3 }, { sku: 'CASE-BLUE', stock: 2 }] }],
    inventory: () => [{ product_id: '100', skus: [
      { id: 's2', seller_sku: 'CASE-BLUE', total_available_quantity: 7, warehouse_inventory: [{ warehouse_id: 'W1', available_quantity: 7 }] },
      { id: 's9', seller_sku: 'GHOST', total_available_quantity: 1, warehouse_inventory: [] },
      { id: 's5', seller_sku: 'CASE-RED', total_available_quantity: 9, warehouse_inventory: [{ warehouse_id: 'W1', available_quantity: 4 }, { warehouse_id: 'W2', available_quantity: 5 }] },
    ] }],
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/inventory.js')
    const out = await service.fixTikTokStock({ ...admin, body: { productId: '100', skuId: 's2', quantity: 999 } })
    assert.deepEqual(updates, [[2, '100:s2']], 'the number comes from the dashboard, not the page')
    assert.match(out.message, /TikTok now has 2 for CASE-BLUE/)
    await assert.rejects(service.fixTikTokStock({ ...admin, body: { productId: '100', skuId: 's9' } }), (e) => e.status === 400 && /no stock for this TikTok SKU/.test(e.body.error))
    await assert.rejects(service.fixTikTokStock({ ...admin, body: { productId: '100', skuId: 's5' } }), (e) => e.status === 400 && /more than one warehouse/.test(e.body.error))
    await assert.rejects(service.fixTikTokStock({ ...admin, body: { productId: 'x', skuId: 's2' } }), (e) => e.status === 400)
    assert.equal(updates.length, 1)
  } finally { restore() }
})
