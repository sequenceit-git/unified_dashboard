const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

test('keywords are returned per product', async () => {
  const calls = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (token, method, path, opts) => { calls.push([method, path, opts.query]); return { products: [{ id: '100', seo_words: [{ text: 'phone case' }, { text: 'clear case' }] }] } } },
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/products.js')
    const res = await service.seoWords({ user: { role: 'super_admin' }, query: { productIds: '100' }, params: {}, body: {} })
    assert.deepEqual(calls, [['GET', '/product/202405/products/seo_words', { product_ids: '100' }]])
    assert.deepEqual(res, [{ productId: '100', words: [{ word: 'phone case' }, { word: 'clear case' }] }])
    await assert.rejects(service.seoWords({ user: { role: 'super_admin' }, query: {}, params: {}, body: {} }), (e) => e.status === 400)
  } finally { restore() }
})

test("TikTok's check result becomes blocking issues and warnings", () => {
  const { checkSummary } = require('../services/listingCheck')
  const res = checkSummary({
    check_result: 'FAILED',
    fail_reasons: [{ code: 1, message: 'Title contains a banned word' }],
    pre_check_results: [{ pre_check_item: 'IMAGE', pre_check_details: [{ short_reason: 'Image too small', related_fields: ['main_images'] }] }],
    warnings: { message: 'Description is short' },
    diagnoses: [{ field: 'TITLE', diagnosis_results: [{ how_to_solve: 'Add the material to the title' }] }],
  })
  assert.equal(res.ok, false)
  assert.deepEqual(res.issues, [
    { field: '', message: 'Title contains a banned word', blocking: true },
    { field: 'main_images', message: 'Image too small', blocking: true },
    { field: '', message: 'Description is short', blocking: false },
    { field: 'TITLE', message: 'Add the material to the title', blocking: false },
  ])
  assert.deepEqual(checkSummary({ check_result: 'PASS' }), { ok: true, issues: [] })
})
