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
  assert.match(md, /`GET \/sell\/analytics\/v1\/seller_standards_profile\/\{program\}\/\{cycle\}`/)
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

// ---- Final review fixes
test('the gap list shows the scope each endpoint needs', () => {
  const md = require('../scripts/apiCoverage/report').buildReport()
  // An endpoint no wave calls yet (seller_standards_profile/{program}/{cycle} is covered since eBay wave 2).
  assert.match(md, /`GET \/sell\/account\/v1\/kyc` \| sell\.account \|/)
})

test('a call that matches no catalog endpoint fails the comparison', () => {
  assert.throws(() => coverageOf()({ endpoints: [row({ id: 'GET /a/v1/b' })] }, [{ id: 'GET /a/v1/unknown', files: ['x.js'] }]), /not in the catalog.*GET \/a\/v1\/unknown/)
})

test('calls made only from dev scripts do not count as covered', () => {
  for (const key of ['ebay', 'tiktok_shop', 'temu']) {
    for (const e of usedEndpoints(key)) for (const f of e.files) assert.ok(!/\/scripts\//.test(f), `${key} ${e.id} from ${f}`)
  }
})

test('report links only open https pages', () => {
  const html = fs.readFileSync(path.join(ROOT, '..', 'docs', 'api-coverage', 'report.html'), 'utf8')
  const pick = (re) => html.match(re)[0]
  const src = [pick(/const esc = [^\n]+/), pick(/function endpointCell[\s\S]*?\n\}/)].join('\n')
  const endpointCell = new Function(`${src}; return endpointCell`)()
  const out = endpointCell({ id: 'GET /x', docs: 'javascript:alert(1)', confirmed: true })
  assert.ok(!/href=/.test(out), out)
  assert.match(endpointCell({ id: 'GET /x', docs: 'https://partner.tiktokshop.com/x', confirmed: true }), /href="https:/)
})

// ---- eBay wave 1 (docs/superpowers/plans/2026-11-24-ebay-api-wave1.md)
test('eBay wave 1 endpoints are covered', () => {
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const rows = new Map(shopCoverage('ebay').map((r) => [r.id, r.status]))
  const WAVE1 = [
    'GET /sell/analytics/v1/traffic_report', 'GET /sell/analytics/v1/seller_standards_profile',
    'GET /sell/analytics/v1/customer_service_metric/{customer_service_metric_type}/{evaluation_type}',
    'GET /sell/finances/v1/seller_funds_summary', 'GET /sell/finances/v1/order_earnings', 'GET /sell/finances/v1/order_earnings_summary', 'GET /sell/finances/v1/billing_activity',
    'GET /post-order/v2/inquiry/search', 'POST /post-order/v2/inquiry/{inquiryId}/issue_refund', 'POST /post-order/v2/inquiry/{inquiryId}/provide_shipment_info',
    'GET /post-order/v2/casemanagement/search', 'POST /post-order/v2/return/{returnId}/mark_as_received', 'POST /post-order/v2/return/{returnId}/issue_refund',
    'GET /sell/fulfillment/v1/payment_dispute_summary', 'POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/accept',
    'GET /commerce/feedback/v1/feedback', 'GET /commerce/feedback/v1/feedback_rating_summary', 'POST /commerce/feedback/v1/respond_to_feedback',
    'Trading:GetBestOffers', 'Trading:RespondToBestOffer',
    'GET /sell/marketing/v1/promotion_report', 'GET /sell/marketing/v1/promotion_summary_report',
  ]
  for (const id of WAVE1) assert.match(String(rows.get(id)), /^covered/, id)
})

// ---- TikTok Shop wave 1 (docs/superpowers/plans/2026-11-24-tiktok-api-wave1.md)
test('TikTok wave 1 endpoints are covered', () => {
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const rows = new Map(shopCoverage('tiktok_shop').map((r) => [r.id, r.status]))
  const WAVE1 = [
    'GET /analytics/202509/shop_skus/performance', 'GET /analytics/202509/shop_skus/{sku_id}/performance', 'GET /analytics/202509/shop_products/{product_id}/performance',
    'GET /analytics/202606/shop_performances/metrics', 'GET /analytics/202606/shop_performances/metrics/{metric_code}/diagnosis',
    'GET /analytics/202606/shop_performances/metrics/{metric_code}/problem_details', 'GET /analytics/202606/shop_performances/metrics/{metric_code}/top_items',
    'GET /analytics/202610/shop_performances/overview', 'GET /analytics/202610/shop_performances/benefits', 'GET /analytics/202510/shop/performance/{date}/performance_per_hour',
    'GET /analytics/202609/shop_videos/overview_performance', 'GET /analytics/202609/shop_videos/batch_performance',
    'GET /analytics/202509/shop_videos/{video_id}/performance', 'GET /analytics/202509/shop_videos/{video_id}/products/performance',
    'GET /analytics/202609/shop_lives/overview_performance', 'GET /analytics/202510/shop_lives/{live_id}/performance_per_minutes',
    'GET /finance/202609/account_balances', 'GET /finance/202609/account_transactions', 'GET /finance/202507/orders/unsettled',
    'GET /finance/202501/statements/{statement_id}/statement_transactions', 'GET /finance/202501/orders/{order_id}/statement_transactions',
    'GET /order/202407/orders/{order_id}/price_detail', 'POST /product/202309/inventory/search',
    'GET /fulfillment/202309/packages/{package_id}', 'GET /fulfillment/202309/orders/{order_id}/tracking', 'POST /fulfillment/202309/packages/ship',
    'GET /return_refund/202309/returns/{return_id}/records', 'GET /return_refund/202309/reject_reasons',
    'GET /product/202405/products/seo_words', 'POST /product/202309/products/listing_check',
  ]
  for (const id of WAVE1) assert.match(String(rows.get(id)), /^covered/, id)
})

// ---- Temu wave 1 (docs/superpowers/plans/2026-11-24-temu-api-wave1.md)
test('Temu wave 1 methods are covered', () => {
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const rows = new Map(shopCoverage('temu').map((r) => [r.id, r.status]))
  const WAVE1 = [
    'bg.open.accesstoken.info.get', 'bg.local.goods.detail.query', 'bg.local.goods.sku.list.query', 'bg.local.goods.publish.status.get',
    'bg.local.goods.sku.out.sn.check', 'bg.local.goods.sku.out.sn.set', 'bg.order.detail.v2.get', 'temu.order.amount.v2.query',
    'bg.order.decryptshippinginfo.get', 'temu.local.goods.sku.stock.query', 'bg.local.goods.sku.list.price.query',
    'temu.local.goods.recommendedprice.query', 'bg.aftersales.aftersales.list.get', 'temu.aftersales.parentaftersales.detail.get',
    'temu.searchrec.ad.reports.goods.query', 'bg.promotion.activity.candidate.goods.query', 'bg.promotion.activity.goods.enroll',
    'bg.promotion.activity.goods.query', 'bg.promotion.activity.goods.operation.query',
  ]
  for (const id of WAVE1) assert.match(String(rows.get(id)), /^covered/, id)
})

// ---- eBay wave 2 (docs/superpowers/plans/2026-11-24-ebay-api-wave2.md)
test('eBay wave 2 endpoints are covered', () => {
  const { shopCoverage } = require('../scripts/apiCoverage/compare')
  const rows = new Map(shopCoverage('ebay').map((r) => [r.id, r.status]))
  const M = '/sell/marketing/v1'
  const WAVE2 = [
    `GET ${M}/ad_campaign`, `POST ${M}/ad_campaign`, `GET ${M}/ad_campaign/{campaign_id}`,
    `POST ${M}/ad_campaign/{campaign_id}/pause`, `POST ${M}/ad_campaign/{campaign_id}/resume`, `POST ${M}/ad_campaign/{campaign_id}/end`,
    `POST ${M}/ad_campaign/{campaign_id}/update_campaign_identification`, `POST ${M}/ad_campaign/{campaign_id}/update_campaign_budget`,
    `GET ${M}/ad_campaign/{campaign_id}/ad`, `GET ${M}/ad_campaign/{campaign_id}/suggest_items`,
    `POST ${M}/ad_campaign/{campaign_id}/bulk_create_ads_by_listing_id`, `POST ${M}/ad_campaign/{campaign_id}/bulk_delete_ads_by_listing_id`,
    `POST ${M}/ad_campaign/{campaign_id}/bulk_update_ads_bid_by_listing_id`, `GET ${M}/ad_campaign/get_campaign_by_name`,
    `POST ${M}/ad_campaign/{campaign_id}/clone`, 'POST /sell/recommendation/v1/find',
    `GET ${M}/ad_report_task`, `POST ${M}/ad_report_task`, `GET ${M}/ad_report_task/{report_task_id}`, `DELETE ${M}/ad_report_task/{report_task_id}`,
    `GET ${M}/ad_report_metadata/{report_type}`, `GET ${M}/ad_report/{report_id}`,
    'GET /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}', 'GET /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/activity',
    'POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/upload_evidence_file', 'POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/add_evidence',
    'POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/update_evidence', 'POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/contest',
    'GET /post-order/v2/return/{returnId}/files', 'GET /post-order/v2/return/{returnId}/tracking', 'POST /post-order/v2/return/{returnId}/send_message',
    'POST /post-order/v2/return/{returnId}/file/upload', 'POST /post-order/v2/return/{returnId}/file/submit', 'POST /post-order/v2/return/{returnId}/add_shipping_label',
    'POST /post-order/v2/return/{returnId}/escalate', 'GET /post-order/v2/inquiry/{inquiryId}', 'POST /post-order/v2/inquiry/{inquiryId}/send_message',
    'POST /post-order/v2/inquiry/{inquiryId}/escalate', 'GET /post-order/v2/casemanagement/{caseId}', 'POST /post-order/v2/casemanagement/{caseId}/appeal',
    'GET /commerce/feedback/v1/awaiting_feedback', 'POST /commerce/feedback/v1/feedback',
    'GET /sell/analytics/v1/seller_standards_profile/{program}/{cycle}', 'GET /sell/finances/v1/payout/{payout_Id}', 'GET /sell/finances/v1/transaction_summary',
    `GET ${M}/promotion/{promotion_id}/get_listing_set`, `DELETE ${M}/item_promotion/{promotion_id}`, `DELETE ${M}/item_price_markdown/{promotion_id}`,
  ]
  const missing = WAVE2.filter((id) => !/^covered/.test(String(rows.get(id))))
  assert.deepEqual(missing, [])
})
