const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const TEMPLATE = {
  inputMaxSpecNum: 2,
  templateInfo: {
    goodsProperties: [
      { pid: 10, refPid: 100, templatePid: 1000, name: 'Material', required: true, chooseMaxNum: 1, isSale: false, values: [{ vid: 1, value: 'Cotton' }, { vid: 2, value: 'Polyester' }], valueUnitList: [] },
      { pid: 11, refPid: 101, templatePid: 1001, name: 'Cotton share', required: false, chooseMaxNum: 1, isSale: false, values: [], valueUnitList: [{ valueUnitId: 5, valueUnit: '%' }], showCondition: [{ parentRefPid: 100, parentVids: [1] }] },
      { pid: 12, refPid: 102, templatePid: 1002, name: 'Features', required: false, chooseMaxNum: 3, isSale: false, values: [{ vid: 7, value: 'Waterproof' }] },
    ],
    goodsSpecProperties: [
      { pid: 20, refPid: 200, templatePid: 2000, parentSpecId: 3001, name: 'Color', required: true, isSale: true, values: [{ vid: 31, value: 'Red', specId: 9001 }] },
    ],
  },
  userInputParentSpecList: [{ parentSpecId: 3002, parentSpecName: 'Size' }],
}

function load({ calls = [], grantedScopes, replies = {} } = {}) {
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected', grantedScopes })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok'), publicImageUrls: (urls) => urls.map((u) => (u.startsWith('/') ? `https://dash.test${u}` : u)).filter((u) => /^https?:\/\//i.test(u)) },
    '/services/core/cache': { wrap: async (k, t, fn) => fn() },
    '../../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (replies[type]) return typeof replies[type] === 'function' ? replies[type](body) : replies[type]
        throw new Error(`unexpected ${type}`)
      },
    },
  })
  return { helpers: freshRequire('marketplaces/temu/app/services/goodsHelpers.js'), restore, calls }
}
const ctx = (query = {}, body = {}, user = { role: 'super_admin' }) => ({ user, allowedShopIds: ['s1'], query, body, params: {} })

test("categories map Temu's tree and mark sellable leaves", async () => {
  const { helpers, restore, calls } = load({ replies: { 'bg.local.goods.cats.get': { goodsCatsList: [
    { catId: 1, catName: 'Clothing', leaf: false, catType: 0, availableStatus: 0 },
    { catId: 2, catName: 'T-Shirts', leaf: true, catType: 0, availableStatus: 0 },
    { catId: 3, catName: 'Old', leaf: true, catType: 1, availableStatus: 1 },
  ] } } })
  try {
    const rows = await helpers.categories(ctx({ parentId: '5' }))
    assert.deepEqual(calls[0], ['bg.local.goods.cats.get', { access_token: 'tok', parentCatId: 5 }])
    assert.deepEqual(rows, [
      { id: 1, name: 'Clothing', leaf: false, apparel: true, available: true },
      { id: 2, name: 'T-Shirts', leaf: true, apparel: true, available: true },
      { id: 3, name: 'Old', leaf: true, apparel: false, available: false },
    ])
    await helpers.categories(ctx({}))
    assert.deepEqual(calls[1][1], { access_token: 'tok' })
  } finally { restore() }
})

test('a template splits attributes and variants and links children to their parent values', async () => {
  const { helpers, restore } = load({ replies: { 'bg.local.goods.template.get': TEMPLATE, 'bg.local.goods.size.element.get': { sizeSpecElementRule: { isSizeChartRequired: false } } } })
  try {
    const t = await helpers.template(ctx({ catId: '2' }))
    assert.deepEqual(t.attributes.map((a) => [a.pid, a.name, a.required, a.multiple]), [[10, 'Material', true, false], [11, 'Cotton share', false, false], [12, 'Features', false, true]])
    assert.deepEqual(t.attributes[1].parent, { refPid: 100, vids: [1] })
    assert.deepEqual(t.attributes[1].units, [{ id: 5, name: '%' }])
    assert.equal(t.attributes[0].parent, null)
    assert.deepEqual(t.variants.map((v) => [v.name, v.parentSpecId, v.values[0].specId]), [['Color', 3001, 9001]])
    assert.deepEqual(t.customVariants, [{ parentSpecId: 3002, name: 'Size' }])
    assert.equal(t.maxVariantTypes, 2)
    assert.equal(t.sizeChart.required, false)
    await assert.rejects(helpers.template(ctx({ catId: 'x' })), (e) => e.status === 400)
  } finally { restore() }
})

test('photos are sent to Temu by their public address and anything else is refused before Temu', async () => {
  const { helpers, restore, calls } = load({ replies: { 'bg.local.goods.image.upload': (b) => ({ url: `https://temu.img/${b.fileUrl.split('/').pop()}` }) } })
  try {
    const res = await helpers.uploadImages(ctx({}, { urls: ['/uploads/a.jpg', 'https://cdn.test/b.png'] }))
    assert.deepEqual(res, [{ source: '/uploads/a.jpg', url: 'https://temu.img/a.jpg' }, { source: 'https://cdn.test/b.png', url: 'https://temu.img/b.png' }])
    assert.equal(calls[0][1].fileUrl, 'https://dash.test/uploads/a.jpg')
    const before = calls.length
    await assert.rejects(helpers.uploadImages(ctx({}, { urls: [] })), (e) => e.status === 400)
    await assert.rejects(helpers.uploadImages(ctx({}, { urls: ['javascript:alert(1)'] })), (e) => e.status === 400)
    assert.equal(calls.length, before)
  } finally { restore() }
})

test('the check lists every illegal word and duplicate code with its field', async () => {
  const { helpers, restore } = load({ replies: {
    'temu.local.goods.illegal.vocabulary.check': { checkResult: 'FAIL', failReasonList: [{ violationItem: 'goodsName', violationWarningContentList: [{ violationType: 'brand', warning: '"Nike" is a protected brand' }] }] },
    'bg.local.goods.out.sn.check': { resultList: [{ outGoodsSn: 'G1', isDuplicate: true, duplicateGoodsId: 55 }] },
    'bg.local.goods.sku.out.sn.check': { resultList: [{ outSkuSn: 'S1', isDuplicate: true, duplicateSkuId: 66 }, { outSkuSn: 'S2', isDuplicate: false }] },
  } })
  try {
    const res = await helpers.check(ctx({}, { title: 'Nike tee', description: 'x', bulletPoints: ['a'], outGoodsSn: 'G1', skus: ['S1', 'S2'] }))
    assert.deepEqual(res.problems, [
      { field: 'title', message: '"Nike" is a protected brand' },
      { field: 'outGoodsSn', message: 'G1 is already used by Temu goods 55.' },
      { field: 'skus', message: 'S1 is already used by Temu SKU 66.' },
    ])
  } finally { restore() }
})

test('shipping templates, brands, tax codes and net-content units are listed', async () => {
  const { helpers, restore } = load({ replies: {
    'bg.freight.template.list.query': { templateList: [{ templateId: 'T1', templateName: 'Standard' }] },
    'temu.local.goods.brand.trademark.V2.get': { trademarkList: [{ brandId: 1, trademarkId: 2, brandName: 'Acme' }], totalNum: 1 },
    'bg.local.goods.tax.code.get': { itemTaxCodeList: [{ itemTaxCode: 'A1', itemTaxCodeDesc: 'General', isSuggest: true }] },
    'temu.local.goods.sku.net.content.unit.query': { netContentUnitTypeDTOList: [{ value: 'Weight', netContentUnitDTOList: [{ code: 1, value: 'oz' }] }] },
    'bg.local.goods.category.recommend': { catIdList: [2] },
  } })
  try {
    assert.deepEqual(await helpers.shippingTemplates(ctx()), [{ id: 'T1', name: 'Standard' }])
    assert.deepEqual(await helpers.brands(ctx()), [{ brandId: 1, trademarkId: 2, name: 'Acme' }])
    assert.deepEqual(await helpers.taxCodes(ctx({ catId: '2' })), [{ code: 'A1', name: 'General', suggested: true }])
    assert.deepEqual(await helpers.netUnits(ctx()), [{ code: 1, name: 'oz', type: 'Weight' }])
    assert.deepEqual(await helpers.recommend(ctx({ title: 'Red tee' })), [2])
  } finally { restore() }
})

test('a sub-admin without Goods gets 403 and a method the app is not granted says how to enable it', async () => {
  const { helpers, restore, calls } = load({ grantedScopes: ['bg.local.goods.list.query'], replies: { 'bg.local.goods.cats.get': { goodsCatsList: [] } } })
  try {
    await assert.rejects(helpers.categories(ctx({}, {}, { role: 'sub_admin', mainRoutes: ['products'], allowedSections: ['temu:orders'] })), (e) => e.status === 403)
    await assert.rejects(helpers.categories(ctx()), /"bg\.local\.goods\.cats\.get" enabled for the app/)
    assert.equal(calls.length, 0)
  } finally { restore() }
})
