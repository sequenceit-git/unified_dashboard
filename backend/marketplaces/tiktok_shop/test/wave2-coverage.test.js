const test = require('node:test')
const assert = require('node:assert/strict')
const { shopCoverage } = require('../../../scripts/apiCoverage/compare')

const WAVE2_AND_UPGRADED = [
  // Wave 1 upgraded versions
  'GET /analytics/202609/shop/performance',
  'GET /analytics/202605/shop_products/performance',
  'GET /finance/202605/payments',
  'GET /analytics/202605/shop_videos/performance',
  'GET /analytics/202609/shop_lives/performance',
  'POST /return_refund/202602/returns/search',
  'POST /return_refund/202602/cancellations/search',
  'POST /fulfillment/202610/orders/{order_id}/packages',
  'POST /return_refund/202602/cancellations',
  'POST /return_refund/202602/returns',
  'POST /return_refund/202606/returns/{return_id}/reject',

  // Packages & Fulfillment
  'GET /fulfillment/202309/combinable_packages/search',
  'GET /fulfillment/202309/packages/{package_id}/handover_time_slots',
  'POST /fulfillment/202309/packages/combine',
  'POST /fulfillment/202309/packages/{package_id}/uncombine',
  'POST /fulfillment/202309/packages/deliver',

  // Orders, Split, POD & External references
  'GET /fulfillment/202309/orders/split_attributes',
  'POST /fulfillment/202309/orders/{order_id}/split',
  'POST /order/202606/pod_details/search',
  'GET /order/202406/orders/{order_id}/external_orders',
  'POST /order/202406/orders/external_orders',
  'POST /order/202406/orders/external_order_search',

  // Product Optimization, SKPP & Opportunities
  'GET /product/202312/prerequisites',
  'GET /product/202405/products/diagnoses',
  'GET /product/202405/products/suggestions',
  'POST /product/202404/images/optimize',
  'POST /product/202411/products/diagnose_optimize',
  'GET /product/202606/skpps/sum',
  'GET /product/202606/skpps/{product_id}',
  'POST /product/202606/skpps/search',
  'POST /product/202604/opportunities/query',
  'GET /product/202604/opportunities/submissions',
  'GET /product/202604/opportunities/{opportunity_id}',
  'POST /product/202604/opportunities/{opportunity_id}/submit',

  // Return, Refund, Aftersales & RMA
  'POST /return_refund/202603/aftersales/search',
  'POST /return_refund/202604/rma/search',
  'POST /return_refund/202602/refunds/calculate',
  'GET /return_refund/202601/decision_eligibility',
  'GET /return_refund/202606/review_decision',
  'GET /return_refund/202602/orders/{order_id}/aftersale_eligibility',
  'POST /return_refund/202405/returns/shipping_documents',

  // Promotions
  'GET /promotion/202309/activities/{activity_id}',
  'GET /promotion/202406/coupons/{coupon_id}',
  'PUT /promotion/202309/activities/{activity_id}',
  'DELETE /promotion/202309/activities/{activity_id}/products',
  'POST /promotion/202607/activities/{activity_id}/republish',

  // Analytics: Bestsellers, Live products, ACC & Off-site
  'GET /analytics/202512/shop/{live_id}/products_performance',
  'GET /analytics/202511/videos/bestselling',
  'GET /analytics/202511/lives/bestselling',
  'GET /analytics/202511/products/bestselling',
  'GET /analytics/202511/creators/bestselling',
  'GET /analytics/202610/acc/overview',
  'GET /analytics/202610/acc/penetration',
  'GET /analytics/202610/acc/preferences/summary',
  'GET /analytics/202610/acc/preferences',
  'GET /analytics/202610/acc/preferences/product/categories',
  'GET /analytics/202610/acc/preferences/live/factors',
  'GET /analytics/202610/acc/brands',
  'GET /analytics/202610/off_site/overview',
  'GET /analytics/202610/off_site/details',
  'GET /analytics/202610/off_site/insights',
  'GET /analytics/202610/off_site/pixels',
]

test('TikTok Wave 2 and upgraded endpoints are covered at latest catalog version', () => {
  const rows = new Map(shopCoverage('tiktok_shop').map((r) => [r.id, r]))
  for (const id of WAVE2_AND_UPGRADED) {
    const entry = rows.get(id)
    assert.ok(entry, `${id} missing from TikTok Shop catalog`)
    assert.equal(entry.status, 'covered', `${id} status is ${entry.status}`)
  }
})
