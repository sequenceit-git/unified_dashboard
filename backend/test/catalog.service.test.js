const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

const chain = (value) => {
  const p = Promise.resolve(value)
  for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p
  return p
}

/** Catalog service with in-memory models. `db` holds the rows each model returns. */
function load(db = {}) {
  const seen = { productFilter: null, created: null, updated: null, pushed: null }
  const Product = {
    find: (filter) => { seen.productFilter = filter; return chain(db.products || []) },
    findById: (id) => chain((db.products || []).find((p) => String(p._id) === String(id)) || null),
    findByIdAndUpdate: async (id, update) => { seen.updated = update; const before = (db.products || []).find((p) => String(p._id) === String(id)); return { ...before, ...update, toObject() { return { ...before, ...update } } } },
    create: async (body) => { seen.created = body; return { _id: 'new', ...body } },
    countDocuments: async () => (db.products || []).length,
    distinct: async () => [],
  }
  const Listing = { find: () => chain(db.listings || []), distinct: async () => [] }
  const manager = { pushProductChanges: async (doc, changes) => { seen.pushed = changes; return [{ ok: true }] } }
  const restore = stubModules({
    '/models/Product': Product,
    '/models/Listing': Listing,
    '/models/Shop': { find: () => chain([]), findById: () => chain(null) },
    '/models/ResearchReport': { updateMany: () => ({ catch: () => {} }) },
    '../../services/marketplace': manager,
    '../marketplace': manager,
    '/services/productImport': {},
    '/catalog/productImport': {},
    '/core/notify': { stockChangedOnShops: async () => {} },
  })
  const service = freshRequire('services/catalog/products.js')
  return { service, seen, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('create sums variant stock and takes the lowest variant price as base price', async () => {
  const { service, seen, restore } = load()
  try {
    await service.create({ ...admin, body: { sku: 'A', title: 'T', variants: [{ sku: 'A1', price: '12', stock: '3' }, { sku: 'A2', price: 9, stock: 2.7 }] } })
    assert.equal(seen.created.stock, 5)
    assert.equal(seen.created.basePrice, 9)
    assert.equal(seen.created.createdBy, 'u1')
  } finally { restore() }
})

test('update ignores sku and createdBy and pushes changed fields to listings', async () => {
  const { service, seen, restore } = load({ products: [{ _id: 'p1', sku: 'A', title: 'Old', basePrice: 10, stock: 1 }] })
  try {
    const out = await service.update({ ...admin, params: { id: 'p1' }, body: { sku: 'HACK', createdBy: 'x', title: 'New', stock: 4 } })
    assert.equal(seen.updated.sku, undefined)
    assert.equal(seen.updated.createdBy, undefined)
    assert.deepEqual(seen.pushed, { title: 'New', quantity: 4 })
    assert.deepEqual(out.marketplaceSync, [{ ok: true }])
  } finally { restore() }
})

test('update of a missing product throws 404', async () => {
  const { service, restore } = load({ products: [] })
  try {
    await assert.rejects(service.update({ ...admin, params: { id: 'nope' }, body: {} }), (err) => err.status === 404 && err.body.error === 'Not found')
  } finally { restore() }
})

test('a sub-admin cannot update a product listed on shops outside their access (403)', async () => {
  const { service, restore } = load({ products: [{ _id: 'p1', sku: 'A' }], listings: [{ shopId: 's1' }, { shopId: 's2' }] })
  try {
    const sub = { user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: {}, body: {}, params: { id: 'p1' } }
    await assert.rejects(service.update(sub), (err) => err.status === 403)
  } finally { restore() }
})

test('list rejects an unknown marketplace with 400', async () => {
  const { service, restore } = load()
  try {
    await assert.rejects(service.list({ ...admin, query: { marketplace: 'amazon' } }), (err) => err.status === 400 && err.body.error === 'Unknown marketplace')
  } finally { restore() }
})

test('list searches title and sku with an escaped regex', async () => {
  const { service, seen, restore } = load({ products: [] })
  try {
    const out = await service.list({ ...admin, query: { q: ' a.b ' } })
    assert.deepEqual(seen.productFilter.$or, [{ title: { $regex: 'a\\.b', $options: 'i' } }, { sku: { $regex: 'a\\.b', $options: 'i' } }])
    assert.equal(out.total, 0)
  } finally { restore() }
})
