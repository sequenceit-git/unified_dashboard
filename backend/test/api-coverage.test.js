const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { usedEndpoints, normalizeId } = require('../scripts/apiCoverage/used')

const ROOT = path.join(__dirname, '..')

test('the extractor finds known calls', () => {
  const ids = (key) => usedEndpoints(key).map((e) => e.id)
  assert.ok(ids('ebay').includes('Trading:GetItem'))
  assert.ok(ids('ebay').some((id) => id.endsWith(' /commerce/message/v1/send_message')))
  assert.ok(ids('tiktok_shop').some((id) => id.endsWith(' /analytics/202405/shop_products/performance')))
  assert.ok(ids('temu').includes('bg.aftersales.cancel.agree'))
  for (const key of ['ebay', 'tiktok_shop', 'temu']) {
    const list = usedEndpoints(key)
    assert.equal(new Set(list.map((e) => e.id)).size, list.length, `${key} ids are unique`)
    for (const e of list) for (const f of e.files) assert.ok(fs.existsSync(path.join(ROOT, f)), f)
  }
})

test('path parameters match whatever their names', () => {
  assert.equal(normalizeId('GET /sell/fulfillment/v1/order/{orderId}'), normalizeId('get /sell/fulfillment/v1/order/{order_id}'))
  assert.equal(normalizeId('GET /commerce/taxonomy/v1/category_tree/0/x'), normalizeId('GET /commerce/taxonomy/v1/category_tree/{category_tree_id}/x'))
})

const CATALOG_DIR = path.join(ROOT, '..', 'docs', 'api-coverage', 'catalog')
const pathOf = (id) => normalizeId(id).replace(/^[A-Z]+ /, '').replace(/\/20\d{4}\//, '/{v}/')

for (const key of ['ebay', 'tiktok_shop', 'temu']) {
  test(`catalog ${key} is well formed`, (t) => {
    const file = path.join(CATALOG_DIR, `${key}.json`)
    if (key !== 'ebay' && !fs.existsSync(file)) return t.skip('not researched yet')
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(catalog.shop, key)
    assert.ok(Array.isArray(catalog.sources) && catalog.sources.length > 0 && catalog.sources.every((u) => u.startsWith('https://')))
    assert.ok(!Number.isNaN(Date.parse(catalog.researchedAt)))
    const ids = catalog.endpoints.map((e) => e.id)
    assert.equal(new Set(ids).size, ids.length, 'unique ids')
    for (const e of catalog.endpoints) {
      for (const field of ['id', 'group', 'name', 'summary']) assert.ok(typeof e[field] === 'string' && e[field].length, `${e.id} ${field}`)
      assert.equal(typeof e.sellerFacing, 'boolean', `${e.id} sellerFacing`)
      assert.equal(typeof e.confirmed, 'boolean', `${e.id} confirmed`)
    }
  })

  test(`the catalog lists every endpoint we call (${key})`, (t) => {
    const file = path.join(CATALOG_DIR, `${key}.json`)
    if (key !== 'ebay' && !fs.existsSync(file)) return t.skip('not researched yet')
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Matched by path (method guesses at call sites aren't reliable) and, for TikTok, any version.
    const known = new Set(catalog.endpoints.map((e) => pathOf(e.id)))
    const missing = usedEndpoints(key).map((e) => e.id).filter((id) => !known.has(pathOf(id)))
    assert.deepEqual(missing, [])
  })
}

// ---- Task 5: compare and annotate the gaps
const row = (over) => ({ group: 'G', name: 'n', summary: 's', sellerFacing: true, confirmed: true, ...over })
const coverageOf = () => require('../scripts/apiCoverage/compare').coverage

test('an older API version counts as covered, flagged', () => {
  const rows = coverageOf()({ endpoints: [row({ id: 'POST /product/202502/products/search' }), row({ id: 'GET /order/202309/orders' })] }, [
    { id: 'POST /product/202309/products/search', files: ['a.js'] },
    { id: 'GET /order/202309/orders', files: ['b.js'] },
  ])
  assert.equal(rows[0].status, 'covered-older')
  assert.deepEqual(rows[0].files, ['a.js'])
  assert.equal(rows[0].calledAs, 'POST /product/202309/products/search')
  assert.equal(rows[1].status, 'covered')
})

test('a call whose method was guessed still covers the only endpoint at that path', () => {
  const rows = coverageOf()({ endpoints: [row({ id: 'POST /promotion/202309/activities/search' }), row({ id: 'GET /x/v1/item/{id}' }), row({ id: 'DELETE /x/v1/item/{id}' })] }, [
    { id: 'GET /promotion/202309/activities/search', files: ['p.js'] },
    { id: 'DELETE /x/v1/item/{sku}', files: ['d.js'] },
  ])
  assert.deepEqual(rows.map((r) => r.status), ['covered', 'missing', 'covered'])
})

test('buyer APIs are never gaps', () => {
  const rows = coverageOf()({ endpoints: [row({ id: 'GET /buy/browse/v1/item/get_item_by_legacy_id', sellerFacing: false }), row({ id: 'GET /buy/browse/v1/item_summary/search', sellerFacing: false })] }, [
    { id: 'GET /buy/browse/v1/item/get_item_by_legacy_id', files: ['i.js'] },
  ])
  assert.deepEqual(rows.map((r) => r.status), ['not-for-sellers', 'not-for-sellers'])
  assert.deepEqual(rows[0].files, ['i.js'])
})

test('unconfirmed endpoints are flagged, not silent gaps', () => {
  const [r] = coverageOf()({ endpoints: [row({ id: 'bg.x.y', confirmed: false })] }, [])
  assert.equal(r.status, 'missing')
  assert.equal(r.confirmed, false)
})

const SECTIONS = {
  ebay: ['analytics', 'messages', 'listings', 'inventory', 'orders', 'returns-cases', 'offers', 'promotions', 'payouts', 'buyers'],
  tiktok_shop: ['analytics', 'customer-service', 'products', 'inventory', 'orders', 'packages', 'returns-cancellations', 'promotions', 'finance', 'videos-live', 'creators', 'customers'],
  temu: ['analytics', 'goods', 'inventory', 'orders', 'shipping', 'after-sales', 'price-reviews', 'promotions', 'ads', 'customers'],
}
for (const key of Object.keys(SECTIONS)) {
  test(`every missing seller endpoint has a gap note (${key})`, () => {
    const { shopCoverage } = require('../scripts/apiCoverage/compare')
    const gaps = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'docs', 'api-coverage', 'gaps', `${key}.json`), 'utf8'))
    const missing = shopCoverage(key).filter((r) => r.status === 'missing')
    assert.ok(missing.length > 0)
    for (const r of missing) {
      const note = gaps[r.id]
      assert.ok(note, `gap note for ${r.id}`)
      assert.ok(['small', 'medium', 'large'].includes(note.size), `${r.id} size`)
      assert.ok(['high', 'medium', 'low'].includes(note.priority), `${r.id} priority`)
      assert.ok(SECTIONS[key].includes(note.section) || /^new: \S/.test(note.section), `${r.id} section ${note.section}`)
      assert.ok(typeof note.value === 'string' && note.value.length > 10, `${r.id} value`)
    }
    for (const id of Object.keys(gaps)) assert.ok(missing.some((r) => r.id === id), `gap note ${id} is for a missing endpoint`)
  })
}

// ---- Task 6: report
test('the report lists every gap', () => {
  const { buildReport } = require('../scripts/apiCoverage/report')
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const md = buildReport()
  for (const key of ['ebay', 'tiktok_shop', 'temu']) {
    for (const r of shopCoverage(key).filter((x) => x.status === 'missing')) assert.ok(md.includes(`\`${r.id}\``), `${key} gap ${r.id}`)
  }
  assert.match(md, /`GET \/sell\/analytics\/v1\/traffic_report`/)
})

test('the README in the repo is up to date', () => {
  const { buildReport } = require('../scripts/apiCoverage/report')
  const readme = fs.readFileSync(path.join(ROOT, '..', 'docs', 'api-coverage', 'README.md'), 'utf8')
  assert.equal(readme, buildReport(), 'run: npm run api-coverage')
})

// ---- App scopes (TikTok E-commerce connector app)
test("gaps are split by the scopes the shop's app has", () => {
  const rows = coverageOf()({ endpoints: [
    row({ id: 'GET /finance/202501/a', scope: 'Finance Information' }),
    row({ id: 'GET /fbt/202408/b', scope: 'Fulfilled by TikTok(FBT) Info' }),
    row({ id: 'GET /x/202309/c', scope: 'Live Data, Finance Information' }),
    row({ id: 'GET /order/202309/d', scope: 'Order Information' }),
  ] }, [{ id: 'GET /order/202309/d', files: ['o.js'] }], { scopes: ['Finance Information', 'Order Information'] })
  assert.deepEqual(rows.map((r) => [r.status, r.access]), [['missing', 'granted'], ['missing', 'needs-scope'], ['missing', 'granted'], ['covered', 'granted']])
  const [noApp] = coverageOf()({ endpoints: [row({ id: 'GET /y/v1/z', scope: 'S' })] }, [])
  assert.equal(noApp.access, undefined)
})

test('the TikTok app scope list includes every scope the dashboard already uses', () => {
  const { shopCoverage, readJson } = require('../scripts/apiCoverage/compare')
  const app = readJson('apps', 'tiktok_shop.json')
  assert.ok(app.appCategory && Array.isArray(app.scopes))
  for (const r of shopCoverage('tiktok_shop').filter((x) => x.status.startsWith('covered'))) {
    assert.ok(r.scope.split(', ').some((s) => app.scopes.includes(s)), `${r.id} needs one of: ${r.scope}`)
  }
})

test('the report shows which gaps the app can call now', () => {
  const { buildReport } = require('../scripts/apiCoverage/report')
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const md = buildReport()
  const now = shopCoverage('tiktok_shop').filter((r) => r.status === 'missing' && r.access === 'granted').length
  assert.match(md, /App category: E-commerce connector/)
  assert.match(md, new RegExp(`\\| TikTok Shop \\|[^\\n]*\\| ${now} \\|\\n`))
  assert.match(md, /\| needs scope: Live Data \|/)
})
