const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const KEY = 'tiktok_shop'
const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p; return p }
const doc = (fields) => ({ ...fields, save: async () => {}, toObject() { return { ...this } } })

/** Shop app manager with recording model stubs; `db` holds this shop's and another shop's rows. */
function load({ db = {}, adapter = {} } = {}) {
  const seen = { productQueries: [], productUpdates: [], created: [], revised: [], fanOutLoaded: false }
  const products = db.products || []
  const matches = (row, q) => Object.entries(q).every(([k, v]) => k.startsWith('$') || (v && typeof v === 'object' && !Array.isArray(v) ? true : String(row[k]) === String(v)))
  const Product = {
    findById: (id) => chain(products.find((p) => String(p._id) === String(id)) || null),
    findOne: (q) => { seen.productQueries.push(q); return chain(products.find((p) => (!q.marketplace || p.marketplace === q.marketplace) && (p.sku === q.$or?.[0]?.sku?.$in?.[0] || q.$or?.[0]?.sku?.$in?.includes?.(p.sku))) || null) },
    exists: async (q) => { seen.productQueries.push(q); return false },
    create: async (body) => { seen.created.push(body); return doc({ _id: 'NEW', ...body }) },
    findByIdAndUpdate: async (id, update) => { seen.productUpdates.push([String(id), update]); return products.find((p) => String(p._id) === String(id)) },
    updateOne: async (q, update) => { seen.productUpdates.push([String(q._id), update]) },
  }
  const listings = (db.listings || []).map(doc)
  const Listing = {
    find: (q) => chain(listings.filter((l) => matches(l, { productId: q.productId, ...(q.marketplace ? { marketplace: q.marketplace } : {}) }))),
    findOne: (q) => chain(listings.find((l) => matches(l, q)) || null),
    countDocuments: async () => 0,
    create: async (b) => doc(b),
  }
  const stub = (extra = {}) => ({ find: () => chain([]), findOne: () => chain(null), findById: () => chain(null), create: async (b) => doc({ _id: 'X', ...b }), updateOne: async () => ({}), exists: async () => false, countDocuments: async () => 0, ...extra })
  const restore = stubModules({
    '/models/Product': Product,
    '/models/Listing': Listing,
    '/models/Shop': stub({ findById: (id) => chain(doc({ _id: id, name: `${id} store`, marketplace: KEY, status: 'connected' })) }),
    '/models/Order': stub(), '/models/Customer': stub(), '/models/SyncLog': stub(), '/models/InventoryLog': stub(),
    '/models/IgnoredListing': stub(), '/models/Conversation': stub(), '/models/Message': stub(),
    '/catalog/fanOut': new Proxy({}, { get: () => { seen.fanOutLoaded = true; return async () => [] } }),
    '/services/customerStats': { saveCustomerStats: async () => {} },
    '/marketplace/connection': { freshToken: async () => 'tok', withShopToken: async (s, fn) => fn('tok') },
    '..': { key: KEY, capabilities: {}, hooks: {}, service: { reviseListing: async () => ({}) }, ...adapter },
  })
  const manager = freshRequire(`marketplaces/${KEY}/app/manager.js`)
  manager.reviseOne = async (shop, listing, product, changes) => { seen.revised.push([listing._id, changes]); return {} }
  return { manager, seen, restore }
}

test("listing sync matches only this shop's products", async () => {
  // Only an eBay product has SKU S1; this shop's item with SKU S1 must get a product of its own.
  const { manager, seen, restore } = load({ db: { products: [doc({ _id: 'PT', sku: 'S1', marketplace: 'ebay', stock: 5 })] } })
  try {
    await manager.saveSyncedListing({ _id: 'shop1', marketplace: KEY }, { externalListingId: '111', sku: 'S1', matchSkus: ['S1'], title: 'Mug', stock: 3, price: 9 }).catch(() => {})
    assert.ok(seen.productQueries.length > 0)
    assert.ok(seen.productQueries.every((q) => q.marketplace === KEY), 'every product lookup is limited to this shop')
    assert.equal(seen.created[0]?.marketplace, KEY, 'the new product belongs to this shop')
  } finally { restore() }
})

test("a product edit pushes only to this shop's listing", async () => {
  const { manager, seen, restore } = load({
    db: { listings: [{ _id: 'LE', productId: 'P', shopId: 'shop1', marketplace: KEY, status: 'live' }, { _id: 'LO', productId: 'P', shopId: 'shop2', marketplace: 'other', status: 'live' }] },
  })
  try {
    await manager.pushProductChanges(doc({ _id: 'P', sku: 'S1', marketplace: KEY }), { price: 12 })
    assert.deepEqual(seen.revised, [['LE', { price: 12 }]])
  } finally { restore() }
})

test("a sale lowers only this shop's product: no cross-shop fan-out remains", () => {
  const fs = require('fs')
  const path = require('path')
  for (const file of ['manager.js', 'services/products.js', 'services/inventory.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /fanOut|exceptShopId/, file)
  }
})
