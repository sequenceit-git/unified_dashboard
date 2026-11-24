const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

function load(overrides = {}) {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push(['GET', path, query])
        if (overrides.get?.[path]) return overrides.get[path](query)
        if (path === '/product/202606/skpps/sum') return { total_count: 5, good_count: 3, need_improvement_count: 2 }
        if (path === '/product/202405/products/diagnoses') {
          return {
            products: [{
              id: 'P-100',
              title: 'Phone stand',
              listing_quality: { current_tier: 'FAIR' },
              diagnoses: [{ field: 'TITLE', diagnosis_results: [{ how_to_solve: 'Add material to title' }] }],
            }],
          }
        }
        if (path === '/product/202405/products/suggestions') {
          return {
            products: [{
              id: 'P-100',
              suggestions: [{ field: 'TITLE', items: [{ text: 'Aluminum Adjustable Phone Stand for Desk' }] }],
            }],
          }
        }
        if (path === '/product/202606/skpps/P-100') return { product_id: 'P-100', skpp_status: 'QUALIFIED' }
        if (path === '/product/202604/opportunities/submissions') return { submissions: [{ submission_id: 'SUB-1', opportunity_id: 'OPP-1', product_id: 'P-100', status: 'UNDER_REVIEW' }] }
        if (path === '/product/202604/opportunities/OPP-1') return { opportunity: { id: 'OPP-1', title: 'Desk Lamp', category_name: 'Lighting', status: 'OPEN' } }
        if (path === '/product/202312/prerequisites') return { check_results: [{ check_item: 'SHIPPING_TEMPLATE', is_failed: false, fail_reasons: [] }] }
        if (path === '/product/202309/products/P-100') return { main_images: [{ uri: 'tos-uri-1' }] }
        throw new Error(`unexpected ${path}`)
      },
      ttPost: async (token, shop, path, body, query) => {
        calls.push(['POST', path, body, query])
        if (overrides.post?.[path]) return overrides.post[path](body, query)
        if (path === '/product/202606/skpps/search') return { skpps: [{ product_id: 'P-100', skpp_status: 'QUALIFIED' }] }
        if (path === '/product/202604/opportunities/query') return { data: { opportunities: [{ id: 'OPP-1', title: 'Desk Lamp', external_product_id: 'B08LAMP', reference_source: '2', category_name_level_1: 'Home', category_name_level_2: 'Lighting', status: 'ACTIVE' }] } }
        if (path === '/product/202404/images/optimize') return { images: [{ optimize_status: 'SUCCESS', url: 'https://img/opt.jpg' }] }
        if (path === '/product/202411/products/diagnose_optimize') return { diagnoses: [{ field: 'TITLE', diagnosis_results: [{ how_to_solve: 'Include brand' }] }], listing_quality: { current_tier: 'GOOD' } }
        if (path === '/product/202604/opportunities/OPP-1/submit') return { submission_id: 'SUB-2' }
        throw new Error(`unexpected ${path}`)
      },
    },
    '../../../models/Listing': {
      find: () => ({ select: () => ({ limit: () => ({ lean: async () => [{ externalListingId: 'P-100:SKU-1' }] }) }) }),
    },
    'services/marketplace/sectionKit': {
      ...require('../../../services/marketplace/sectionKit'),
      listingTitles: async () => new Map([['P-100', { title: 'Phone stand', sku: 'TTS-1' }]]),
    },
  })
  return { products: freshRequire('marketplaces/tiktok_shop/sections/products.js'), calls, restore }
}

test('products section builds quality, opportunities, submissions, and readiness tables', async () => {
  const { products, calls, restore } = load()
  try {
    const res = await products('tok', { _id: 'shop1' })
    assert.deepEqual(res.tables.map((t) => [t.id, t.tab]), [
      ['quality', 'Listing quality'],
      ['opportunities', 'Opportunities'],
      ['submissions', 'Opportunities'],
      ['prerequisites', 'Shop readiness'],
    ])
    assert.equal(res.tables[0].rows[0].product, 'Phone stand')
    assert.equal(res.tables[0].rows[0].url, 'https://shop.tiktok.com/view/product/P-100')
    assert.equal(res.tables[1].rows[0].title, 'Desk Lamp')
    assert.equal(res.tables[1].rows[0].url, 'https://www.amazon.com/dp/B08LAMP')
    assert.equal(res.tables[1].rows[0].category, 'Home › Lighting')
    assert.equal(res.tables[2].rows[0].url, 'https://shop.tiktok.com/view/product/P-100')
    assert.equal(res.tables[3].rows[0].status, 'Ready')
    const oppQuery = calls.find(([m, p]) => m === 'POST' && p === '/product/202604/opportunities/query')
    assert.equal(oppQuery?.[2]?.opportunity_type, 'PRODUCT')
  } finally { restore() }
})

test('diagnosis detail returns SKPP status, diagnoses, and suggested titles', async () => {
  const { products, restore } = load()
  try {
    const detail = await products.details.diagnosis('tok', {}, 'P-100:SKU-1')
    assert.deepEqual(detail.suggestedTitles, ['Aluminum Adjustable Phone Stand for Desk'])
    assert.equal(detail.tables[0].rows[0].finding, 'Add material to title')
  } finally { restore() }
})

test('actions optimize-images, diagnose-draft, and submit-opportunity call TikTok endpoints', async () => {
  const { products, calls, restore } = load()
  try {
    const imgRes = await products.actions['optimize-images']('tok', {}, 'P-100')
    assert.match(imgRes.message, /Optimized 1 image/)

    const diagRes = await products.actions['diagnose-draft']('tok', {}, 'P-100', { title: 'Short title' })
    assert.equal(diagRes.diagnoses[0].issues[0], 'Include brand')

    const subRes = await products.actions['submit-opportunity']('tok', {}, 'OPP-1', 'P-100')
    assert.match(subRes.message, /Submitted product P-100 for opportunity OPP-1/)
    assert.ok(calls.some(([, p]) => p === '/product/202604/opportunities/OPP-1/submit'))
  } finally { restore() }
})
