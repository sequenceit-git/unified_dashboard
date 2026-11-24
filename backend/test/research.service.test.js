const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

const ID = '64b7f0c2a1b2c3d4e5f60718'

function load(report) {
  const deleted = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'populate']) p[m] = () => p; return p }
  const ResearchReport = {
    findById: () => chain(report || null),
    find: () => chain([]),
    deleteOne: async (q) => { deleted.push(q._id) },
  }
  const restore = stubModules({
    '/models/ResearchReport': ResearchReport,
    '/models/Product': { findById: () => chain(null) },
    '/models/Shop': { findOne: async () => null },
    '/models/Listing': { find: () => chain([]), findOne: async () => null },
    '../../services/marketplace': {},
    '/agent/discovery/discoveryAgent': { runDiscoveryAgent: async () => {} },
    '/agent/discovery/listingImage': { productImages: async () => [] },
  })
  const service = freshRequire('services/research/reports.js')
  return { service, deleted, restore }
}

const sub = (marketplaces = []) => ({ user: { id: 'u2', role: 'sub_admin' }, shopMarkets: new Map(marketplaces.map((m, i) => [String(i), m])), allowedShopIds: [], query: {}, body: {}, params: {} })
const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

test('only the person who started a search can delete it', async () => {
  const { service, deleted, restore } = load({ _id: ID, runBy: 'u1' })
  try {
    await assert.rejects(service.deleteReport({ ...sub(), params: { reportId: ID } }), (e) => e.status === 403)
    assert.deepEqual(await service.deleteReport({ ...admin, params: { reportId: ID } }), { ok: true })
    assert.deepEqual(deleted, [ID])
  } finally { restore() }
})

test('report ids are validated: 400 on status, 404 on report', async () => {
  const { service, restore } = load(null)
  try {
    await assert.rejects(service.status({ ...admin, params: { reportId: 'bad' } }), (e) => e.status === 400 && e.body.error === 'Invalid report ID')
    await assert.rejects(service.report({ ...admin, params: { reportId: 'bad' } }), (e) => e.status === 404 && e.body.error === 'Report not found')
  } finally { restore() }
})

test('relist needs reportId, rank and marketplace, and listing rights on that marketplace', async () => {
  const { service, restore } = load(null)
  try {
    await assert.rejects(service.relist({ ...admin, body: { reportId: ID } }), (e) => e.status === 400)
    await assert.rejects(service.relist({ ...sub(['ebay']), body: { reportId: ID, rank: 1, marketplace: 'temu' } }), (e) => e.status === 403 && /Temu/.test(e.body.error))
    await assert.rejects(service.relist({ ...admin, body: { reportId: ID, rank: 1, marketplace: 'ebay' } }), (e) => e.status === 404 && e.body.error === 'Research report not found')
  } finally { restore() }
})

test('export builds a CSV with formula-safe cells and download headers', async () => {
  const { service, restore } = load({ _id: ID, opportunities: [{ title: '=HYPERLINK("x")', metrics: { price: 9.5 }, opportunityScore: 80 }] })
  try {
    const file = await service.exportReport({ ...admin, params: { reportId: ID }, query: { format: 'csv' } })
    assert.equal(file.headers['Content-Type'], 'text/csv; charset=utf-8')
    assert.equal(file.headers['Content-Disposition'], `attachment; filename="product_catalog_export_${ID.slice(-8)}.csv"`)
    assert.match(file.body, /^sku,title,/)
    assert.match(file.body, /"'=HYPERLINK\(""x""\)"/)
    await assert.rejects(service.exportReport({ ...admin, params: { reportId: 'bad' }, query: {} }), (e) => e.status === 400)
  } finally { restore() }
})

test('generate queues the report and starts the discovery agent', async () => {
  const runs = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'populate']) p[m] = () => p; return p }
  const report = { _id: ID, status: 'queued', progress: 0, save: async () => {} }
  const restore = stubModules({
    '/models/ResearchReport': Object.assign(function ResearchReport() { return report }, { findOne: () => chain(null), create: async () => report, find: () => chain([]) }),
    '/models/Product': {}, '/models/Shop': {}, '/models/Listing': {},
    '../../services/marketplace': {},
    '/agent/discovery/discoveryAgent': { runDiscoveryAgent: async (...args) => { runs.push(args) } },
    '/agent/discovery/listingImage': { productImages: async () => [] },
    '/system/aiSettings': { getAiConfig: async () => ({ apiKey: 'k', model: 'm' }) },
  })
  try {
    const service = freshRequire('services/research/reports.js')
    const out = await service.generate({ ...admin, body: { categories: ['Home'] } })
    assert.equal(out.status, 'queued')
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    assert.equal(runs.length, 1, 'runDiscoveryAgent was not started')
  } finally { restore() }
})

test("research relists through the shop's app", async () => {
  const calls = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'populate']) p[m] = () => p; return p }
  const report = { _id: ID, opportunities: [{ rank: 1, addedProductId: 'P1', listedShops: [] }], save: async () => {}, markModified: () => {} }
  const shop = { _id: 'T1', name: 'Temu store', marketplace: 'temu', status: 'connected' }
  const listing = { _id: 'L1', productId: 'P1', shopId: 'T1', externalListingId: 'G1', status: 'ended', save: async () => {} }
  const apps = {
    temu: { catalog: {
      listingAction: async (s, l, action, options) => { calls.push(['listingAction', s.marketplace, l._id, action, options]); return { status: 'live' } },
      remember: async (shopId) => { calls.push(['remember', shopId]) },
    } },
  }
  const registry = { KEYS: ['ebay', 'tiktok_shop', 'temu'], canonical: (v) => v, labels: () => ({ temu: 'Temu Shop' }), get: (key) => ({ app: apps[key] }), listingUrl: () => 'https://seller.temu.com/G1' }
  const restore = stubModules({
    '/models/ResearchReport': { findById: () => chain(report), find: () => chain([]) },
    '/models/Product': { findById: () => chain({ sku: 'S1', stock: 4, title: 'Mug' }), find: (q) => chain([{ _id: 'P1', marketplace: 'temu', sku: 'S1', stock: 4, title: 'Mug' }].filter((p) => !q.marketplace || p.marketplace === q.marketplace)) },
    '/models/Shop': { findOne: async () => shop, find: () => chain([]) },
    '/models/Listing': { find: () => chain([]), findOne: async () => listing },
    '../../services/marketplace': {},
    '../../marketplaces': registry,
    '/core/notify': { listingStatusChanged: async () => {} },
    '/agent/discovery/discoveryAgent': { runDiscoveryAgent: async () => {} },
    '/agent/discovery/listingImage': { productImages: async () => [] },
  })
  try {
    const service = freshRequire('services/research/reports.js')
    const out = await service.relist({ ...admin, body: { reportId: ID, rank: 1, marketplace: 'temu' } })
    assert.equal(out.success, true)
    assert.deepEqual(calls, [['listingAction', 'temu', 'L1', 'relist', { quantity: 4 }], ['remember', 'T1']])
  } finally {
    restore()
  }
})

test("add to catalog creates the product for the chosen shop, never reusing another shop's", async () => {
  const created = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'populate']) p[m] = () => p; return p }
  // Already added to eBay (P-ebay); now added to Temu.
  const opp = { rank: 1, title: 'Planter', listingUrl: 'https://x.test/p', addedProductId: 'P-ebay', listedShops: ['ebay'], metrics: { price: 20 } }
  const report = { _id: ID, opportunities: [opp], save: async () => {}, markModified: () => {} }
  const products = [{ _id: 'P-ebay', marketplace: 'ebay', source: 'research_bot', attributes: { listingUrl: 'https://x.test/p' } }]
  const registry = { KEYS: ['ebay', 'tiktok_shop', 'temu'], canonical: (v) => v, labels: () => ({}), get: () => ({ app: { catalog: { capabilities: () => ({ canList: true }) } } }), listingUrl: () => '' }
  const restore = stubModules({
    '/models/ResearchReport': { findById: () => chain(report), find: () => chain([]) },
    '/models/Product': {
      find: (q) => chain(products.filter((p) => !q.marketplace || p.marketplace === q.marketplace)),
      findById: (id) => chain(products.find((p) => p._id === id) || null),
      create: async (body) => { created.push(body); return { _id: 'P-temu', ...body } },
    },
    '/models/Shop': { findOne: () => chain({ _id: 'T1' }), find: () => chain([]) },
    '/models/Listing': { find: () => chain([]), findOne: async () => null, exists: async () => false },
    '../../services/marketplace': {},
    '../../marketplaces': registry,
    '/agent/discovery/discoveryAgent': { runDiscoveryAgent: async () => {} },
    '/agent/discovery/listingImage': { productImages: async () => [] },
  })
  try {
    const service = freshRequire('services/research/reports.js')
    const out = await service.addToCatalog({ ...admin, body: { reportId: ID, rank: 1, marketplace: 'temu' } })
    assert.equal(created.length, 1, 'a new product for Temu')
    assert.equal(created[0].marketplace, 'temu')
    assert.equal(out.product._id, 'P-temu')
  } finally {
    restore()
  }
})

test("add to catalog shapes the product for the chosen shop: its title, the agent's weight, size and cost", async () => {
  const created = []
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean', 'populate']) p[m] = () => p; return p }
  const opp = {
    rank: 1, title: 'Ceramic Plant Pot With Drainage Hole And Saucer For Indoor Outdoor Succulents Herbs Large 8 Inch White Modern',
    description: 'A pot.', brand: 'Leafy', listingUrl: 'https://x.test/p', listedShops: [], metrics: { price: 24 },
    specs: [{ name: 'Item Weight', value: '1.5 Pounds' }, { name: 'Product Dimensions', value: '8 x 8 x 7 inches' }, { name: 'Color', value: 'White' }],
    sourcing: { unitCost: 6.5 },
  }
  const report = { _id: ID, opportunities: [opp], save: async () => {}, markModified: () => {} }
  const seen = []
  const hooks = { researchListing: async (input) => { seen.push(input); return { title: 'Leafy 8" Ceramic Plant Pot with Drainage Hole & Saucer, White' } } }
  const registry = { KEYS: ['ebay', 'tiktok_shop', 'temu'], canonical: (v) => v, labels: () => ({}), get: () => ({ hooks, app: { catalog: { capabilities: () => ({ canList: true }) } } }), listingUrl: () => '' }
  const restore = stubModules({
    '/models/ResearchReport': { findById: () => chain(report), find: () => chain([]) },
    '/models/Product': { find: () => chain([]), findById: () => chain(null), create: async (body) => { created.push(body); return { _id: 'P1', ...body } } },
    '/models/Shop': { findOne: () => chain({ _id: 'S1' }), find: () => chain([]) },
    '/models/Listing': { find: () => chain([]), findOne: async () => null, exists: async () => false },
    '../../services/marketplace': {},
    '../../marketplaces': registry,
    '/agent/discovery/discoveryAgent': { runDiscoveryAgent: async () => {} },
    '/agent/discovery/listingImage': { productImages: async () => [] },
  })
  try {
    const service = freshRequire('services/research/reports.js')
    await service.addToCatalog({ ...admin, body: { reportId: ID, rank: 1, marketplace: 'ebay', title: opp.title } })
    const p = created[0]
    assert.equal(p.title, 'Leafy 8" Ceramic Plant Pot with Drainage Hole & Saucer, White')
    assert.equal(seen[0].brand, 'Leafy')
    assert.equal(p.weight, 1.5)
    assert.deepEqual(p.dimensions, { length: 8, width: 8, height: 7 })
    assert.equal(p.costPrice, 6.5)
    assert.equal(p.attributes.Color, 'White')
  } finally {
    restore()
  }
})

test('weights and sizes from the agent are read in pounds and inches', () => {
  const { specMeasurements } = require('../services/research/measurements')
  assert.deepEqual(specMeasurements([{ name: 'Weight', value: '500 g' }]), { weight: 1.1 })
  assert.deepEqual(specMeasurements([{ name: 'Item Weight', value: '12 oz' }]), { weight: 0.8 })
  assert.deepEqual(specMeasurements([{ name: 'Package Dimensions', value: '20 x 10 x 5 cm' }]), { dimensions: { length: 7.9, width: 3.9, height: 2 } })
  assert.deepEqual(specMeasurements([{ name: 'Color', value: 'Red' }]), {})
  assert.deepEqual(specMeasurements([{ name: 'Weight Capacity', value: '300 lb' }, { name: 'Maximum Load Weight', value: '50 kg' }]), {}, 'what it holds is not what it weighs')
  assert.deepEqual(specMeasurements([{ name: 'Product Dimensions', value: '2 x 3 x 0.5 ft' }]), { dimensions: { length: 24, width: 36, height: 6 } })
  assert.deepEqual(specMeasurements([{ name: 'Product Dimensions', value: '2 x 1 x 0.5 m' }]), { dimensions: { length: 78.7, width: 39.4, height: 19.7 } })
  assert.deepEqual(specMeasurements(null), {})
})
