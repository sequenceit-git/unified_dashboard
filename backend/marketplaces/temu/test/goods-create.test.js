const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const RAW_TEMPLATE = {
  templateInfo: {
    goodsProperties: [{ pid: 10, refPid: 100, templatePid: 1000, name: 'Material', required: true, chooseMaxNum: 1, isSale: false, values: [{ vid: 1, value: 'Cotton' }] }],
    goodsSpecProperties: [{ pid: 20, refPid: 200, templatePid: 2000, parentSpecId: 3001, name: 'Color', isSale: true, values: [{ vid: 31, value: 'Red', specId: 9001 }, { vid: 32, value: 'Blue', specId: 9002 }] }],
  },
}
const SKU = (specId, sn) => ({ specs: [{ parentSpecId: 3001, specId, vid: specId === 9001 ? 31 : 32, value: specId === 9001 ? 'Red' : 'Blue' }], outSkuSn: sn, basePrice: '9.99', quantity: 5, weight: 1, length: 5, width: 5, height: 1, images: ['https://temu.img/s.jpg'] })
const FORM = { catId: 29069, title: 'Tee', images: ['https://temu.img/a.jpg'], shippingTemplateId: 'T1', handlingDays: 2, attributes: { 1000: { vids: [1] } }, variants: [SKU(9001, 'TEE-R'), SKU(9002, 'TEE-B')] }

function service(replies, calls) {
  const listings = freshRequire('marketplaces/temu/listings.js')
  return {
    ...listings,
    call: async (type, body) => {
      calls.push([type, body])
      const r = replies[type]
      if (r instanceof Error) throw r
      if (r === undefined) throw new Error(`unexpected ${type}`)
      return typeof r === 'function' ? r(body) : r
    },
  }
}

test('a new goods is checked then added and saved as under review', async () => {
  const calls = []
  const s = service({
    'bg.local.goods.template.get': RAW_TEMPLATE,
    'bg.local.goods.compliance.property.check': { isMatch: true },
    'bg.local.goods.add': { goodsId: 555, skuInfoList: [{ skuId: 1, outSkuSn: 'TEE-R' }, { skuId: 2, outSkuSn: 'TEE-B' }] },
  }, calls)
  const res = await s.createListing('tok', { title: 'Tee' }, { temuForm: FORM })
  assert.deepEqual(calls.map(([t]) => t), ['bg.local.goods.template.get', 'bg.local.goods.compliance.property.check', 'bg.local.goods.add'])
  assert.deepEqual(calls[1][1], { access_token: 'tok', normalPropertyList: [{ pid: 10, refPid: 100, vid: 1 }] })
  assert.equal(calls[2][1].access_token, 'tok')
  assert.deepEqual(calls[2][1].skuList.map((x) => x.specIdList), [[9001], [9002]])
  assert.equal(res.status, 'pending')
  assert.equal(res.externalListingId, '555:1')
})

test('goods ids come back as goodsId:skuId for every SKU', async () => {
  const s = service({
    'bg.local.goods.template.get': RAW_TEMPLATE,
    'bg.local.goods.compliance.property.check': { isMatch: true },
    'bg.local.goods.add': { goodsId: 555, skuInfoList: [{ skuId: 1, outSkuSn: 'TEE-R' }, { skuId: 2, outSkuSn: 'TEE-B' }] },
  }, [])
  const res = await s.createListing('tok', {}, { temuForm: FORM })
  assert.deepEqual(res.temuSkus, [{ skuId: '1', outSkuSn: 'TEE-R', externalListingId: '555:1' }, { skuId: '2', outSkuSn: 'TEE-B', externalListingId: '555:2' }])
})

test("a refused add keeps the form and shows Temu's reason", async () => {
  const calls = []
  // The form is incomplete: nothing reaches Temu's add.
  const s1 = service({ 'bg.local.goods.template.get': RAW_TEMPLATE }, calls)
  await assert.rejects(s1.createListing('tok', {}, { temuForm: { ...FORM, attributes: {} } }), (e) => e.status === 400 && e.problems.some((p) => p.field === 'attributes.1000'))
  assert.ok(!calls.some(([t]) => t === 'bg.local.goods.add'))
  // Temu's property check refuses: its message, no add.
  const s2 = service({ 'bg.local.goods.template.get': RAW_TEMPLATE, 'bg.local.goods.compliance.property.check': { isMatch: false, errorMsg: 'Material not allowed for this category' } }, calls)
  await assert.rejects(s2.createListing('tok', {}, { temuForm: FORM }), (e) => e.status === 400 && /Material not allowed/.test(e.message))
  // Temu refuses the add itself.
  const s3 = service({ 'bg.local.goods.template.get': RAW_TEMPLATE, 'bg.local.goods.compliance.property.check': { isMatch: true }, 'bg.local.goods.add': Object.assign(new Error('The catId not a leaf category'), { code: 150010124 }) }, calls)
  await assert.rejects(s3.createListing('tok', {}, { temuForm: FORM }), /not a leaf category/)
  // No Temu form at all.
  await assert.rejects(s3.createListing('tok', {}, {}), (e) => e.status === 400)
})

test("the list route answers 422 with Temu's per-field problems and no live listing", async () => {
  const saved = []
  const restore = stubModules({
    '/models/Product': modelStub(() => ({ _id: 'p1', sku: 'TEE', title: 'Tee', images: [], stock: 5, basePrice: 9.99 })),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected', name: 'Temu Shop' })),
    '/models/Listing': modelStub(() => null, { findOneAndUpdate: async (q, u) => { saved.push(u); return u } }),
    '/services/productAccess': { assertProductAccess: async () => {}, productAccess: async () => ({}), ownDrafts: () => ({}) },
    '../manager': {
      listingCapabilities: () => ({ canList: true }),
      publishListing: async () => { throw Object.assign(new Error('Material is required.'), { status: 400, problems: [{ field: 'attributes.1000', message: 'Material is required.' }] }) },
    },
    '/services/core/notify': { listingStatusChanged: async () => {} },
  })
  try {
    const products = freshRequire('marketplaces/temu/app/services/products.js')
    await assert.rejects(products.listOnShop({ user: { role: 'super_admin' }, params: { id: 'p1' }, query: {}, body: { shopId: 's1', temuForm: FORM } }), (e) => e.status === 422 && e.body.problems[0].field === 'attributes.1000')
    assert.ok(saved.every((u) => u.status !== 'live'))
  } finally { restore() }
})
