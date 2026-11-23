const test = require('node:test')
const assert = require('node:assert/strict')
const { planSplit, run } = require('../scripts/splitProducts')

const shops = [{ _id: 'sE', marketplace: 'ebay' }, { _id: 'sT', marketplace: 'tiktok_shop' }, { _id: 'sM', marketplace: 'temu' }]
let n = 0
const makeId = () => `new${++n}`

test('splits a product listed on two shops', () => {
  n = 0
  const plan = planSplit({
    shops,
    products: [{ _id: 'P', sku: 'S1', stock: 10, basePrice: 20 }],
    listings: [{ _id: 'LE', productId: 'P', shopId: 'sE', stock: 4, price: 19 }, { _id: 'LT', productId: 'P', shopId: 'sT', stock: 7, price: 21 }],
    orders: [{ _id: 'OE', marketplace: 'ebay', items: [{ productId: 'P' }] }, { _id: 'OT', marketplace: 'tiktok_shop', items: [{ productId: 'X' }, { productId: 'P' }] }],
    logs: [{ _id: 'G1', productId: 'P', shopId: 'sT' }, { _id: 'G2', productId: 'P', shopId: null }],
    reports: [{ _id: 'R', opportunities: [{ addedProductId: 'P', targetMarketplace: 'tiktok' }] }],
    makeId,
  })
  assert.deepEqual(plan.assign, [{ productId: 'P', marketplace: 'ebay', stock: 4, price: 19 }])
  assert.deepEqual(plan.copies, [{ fromId: 'P', newId: 'new1', marketplace: 'tiktok_shop', stock: 7, price: 21 }])
  assert.deepEqual(plan.repoint, {
    listings: [['LT', 'new1']],
    orderItems: [['OT', 1, 'new1']],
    logs: [['G1', 'new1']],
    reports: [['R', 0, 'new1']],
  })
})

test('an unlisted product goes to its target shop', () => {
  const plan = planSplit({ shops, products: [{ _id: 'P', sku: 'S1', stock: 3, basePrice: 9, attributes: { targetMarketplace: 'temu' } }], listings: [], orders: [], logs: [], reports: [], makeId })
  assert.deepEqual(plan.assign, [{ productId: 'P', marketplace: 'temu', stock: 3, price: 9 }])
  assert.deepEqual(plan.copies, [])
})

test('a product with no shop is copied to every shop', () => {
  n = 0
  const plan = planSplit({ shops, products: [{ _id: 'P', sku: 'S1', stock: 3, basePrice: 9 }], listings: [], orders: [], logs: [], reports: [], makeId })
  assert.deepEqual(plan.assign, [{ productId: 'P', marketplace: 'ebay', stock: 3, price: 9 }])
  assert.deepEqual(plan.copies.map((c) => c.marketplace), ['tiktok_shop', 'temu'])
  assert.deepEqual(plan.copies.map((c) => [c.stock, c.price]), [[3, 9], [3, 9]])
})

test('a second run changes nothing', () => {
  const plan = planSplit({ shops, products: [{ _id: 'P', sku: 'S1', marketplace: 'ebay', stock: 4 }], listings: [{ _id: 'LE', productId: 'P', shopId: 'sE' }], orders: [], logs: [], reports: [], makeId })
  assert.deepEqual(plan, { assign: [], copies: [], repoint: { listings: [], orderItems: [], logs: [], reports: [] }, mismatched: 0 })
})

function fakeDb() {
  const calls = []
  const data = { shops, products: [{ _id: 'P', sku: 'S1', stock: 10, basePrice: 20 }], listings: [{ _id: 'LE', productId: 'P', shopId: 'sE', stock: 4, price: 19 }, { _id: 'LT', productId: 'P', shopId: 'sT', stock: 7, price: 21 }], orders: [], logs: [], reports: [] }
  return {
    calls,
    db: {
      load: async () => data,
      backup: async (snapshot) => { calls.push(['backup', Object.keys(snapshot).sort().join(',')]) },
      createCopies: async (docs) => { calls.push(['createCopies', docs.length]) },
      assign: async (rows) => { calls.push(['assign', rows.length]) },
      repoint: async (repoint) => { calls.push(['repoint', repoint.listings.length]) },
      dropOldSkuIndex: async () => { calls.push(['dropOldSkuIndex']) },
      ensureIndexes: async () => { calls.push(['ensureIndexes']) },
    },
  }
}

test('the runner only writes with --apply and backs up first', async () => {
  const dry = fakeDb()
  const summary = await run({ apply: false, db: dry.db, makeId, log: () => {} })
  assert.deepEqual(dry.calls, [])
  assert.deepEqual(summary, { assigned: 1, copies: 1, listings: 1, orderItems: 0, logs: 0, reports: 0, mismatched: 0, applied: false })
  const real = fakeDb()
  await run({ apply: true, db: real.db, makeId, log: () => {} })
  assert.equal(real.calls[0][1], 'listings,logs,orders,products,reports,shops')
})

test('products are unique per shop, not overall', () => {
  const indexes = require('../models/Product').schema.indexes()
  assert.ok(indexes.some(([keys, opts]) => JSON.stringify(keys) === '{"marketplace":1,"sku":1}' && opts.unique), 'unique { marketplace, sku }')
  assert.ok(!indexes.some(([keys, opts]) => JSON.stringify(keys) === '{"sku":1}' && opts.unique), 'no unique { sku }')
})

test('a re-run after a crash reuses the copies already made and finishes the repoints', () => {
  // The first run created the TikTok Shop copy (splitFrom P) and died before giving P its shop.
  const plan = planSplit({
    shops,
    products: [{ _id: 'P', sku: 'S1', stock: 10 }, { _id: 'C', sku: 'S1', marketplace: 'tiktok_shop', splitFrom: 'P', stock: 7 }],
    listings: [{ _id: 'LE', productId: 'P', shopId: 'sE', stock: 4, price: 19 }, { _id: 'LT', productId: 'P', shopId: 'sT', stock: 7, price: 21 }],
    orders: [], logs: [], reports: [], makeId,
  })
  assert.deepEqual(plan.copies, [], 'no duplicate copy')
  assert.deepEqual(plan.repoint.listings, [['LT', 'C']])
  assert.deepEqual(plan.assign.map((a) => [a.productId, a.marketplace]), [['P', 'ebay']])
})

test("the plan counts listings still attached to another shop's product", () => {
  const plan = planSplit({
    shops,
    products: [{ _id: 'P', sku: 'S1', marketplace: 'ebay' }],
    listings: [{ _id: 'LT', productId: 'P', shopId: 'sT' }],
    orders: [], logs: [], reports: [], makeId,
  })
  assert.equal(plan.mismatched, 1)
})

test('apply writes copies and repoints before giving originals their shop, from a fresh read', async () => {
  const { db, calls } = fakeDb()
  let loads = 0
  const load = db.load
  db.load = async () => { loads += 1; return load() }
  await run({ apply: true, db, makeId, log: () => {} })
  assert.deepEqual(calls.map((c) => c[0]), ['backup', 'dropOldSkuIndex', 'createCopies', 'repoint', 'assign', 'ensureIndexes'])
  assert.equal(loads, 2, 're-reads the data right before writing')
})
