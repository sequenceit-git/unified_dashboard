const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const PDF = Buffer.from('%PDF-1.4 test')
const dataUrl = (type, buf) => `data:${type};base64,${buf.toString('base64')}`

function load({ calls = [], replies = {}, listing = { _id: 'l1', externalListingId: '77:1' } } = {}) {
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => listing),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': {
      call: async (type, body) => {
        calls.push([type, body])
        const r = replies[type]
        if (r === undefined) throw new Error(`unexpected ${type}`)
        return typeof r === 'function' ? r(body) : r
      },
    },
  })
  return { compliance: freshRequire('marketplaces/temu/app/services/compliance.js'), restore, calls }
}
const admin = (params = {}, body = {}, query = {}) => ({ user: { role: 'super_admin' }, params, body, query })

test("goods missing compliance are listed with what Temu needs", async () => {
  const { compliance, restore, calls } = load({ replies: {
    'bg.local.compliance.goods.list.query': (b) => (b.pageNo === 1
      ? { total: 2, goodsList: [{ goodsId: 77, goodsName: 'Kids cup', thumbUrl: 'https://t/1.jpg', certificateInfoList: [{ certType: 5, status: 1 }, { certType: 6, status: 2 }] }] }
      : { total: 2, goodsList: [{ goodsId: 88, goodsName: 'Mug', certificateInfoList: [] }] }),
  } })
  try {
    const rows = await compliance.list(admin({}, {}, {}))
    assert.equal(calls.filter(([t]) => t === 'bg.local.compliance.goods.list.query').length, 2)
    assert.deepEqual(rows.map((r) => [r.goodsId, r.title, r.certificates]), [['77', 'Kids cup', 2], ['88', 'Mug', 0]])
  } finally { restore() }
})

test("a goods' detail shows required certificates with Temu's own status text and review results", async () => {
  const { compliance, restore } = load({ replies: {
    'bg.local.goods.detail.query': { goodsId: 77, catId: 29069 },
    'bg.local.goods.compliance.rules.get': { goodsCertList: [{ certType: 5, certName: 'Children\'s Product Certificate', isRequired: true, uploadStatus: 0, uploadStatusLanguageMap: { en: 'Not uploaded' } }], checkInfoList: [{ checkShowName: 'Age grading label', checkResultDesc: 'Missing', checkFailReason: 'Add the age label to the photos' }] },
    'bg.arbok.open.product.cert.query': { productCertList: [{ certType: 6, certName: 'Test report', auditStatus: 3, rejectReason: 'Report is expired' }] },
    'bg.arbok.open.cert.queryNeedUploadItems': { certNeedUploadItems: [{ aliasName: 'Certificate file', contentType: 1, hasExpireTime: true }] },
    'bg.goods.compliancelabel.get': { pageResult: { data: [{ productId: 77, skuComplianceLabels: [{ productSkuId: 1, complianceLabelPics: ['https://t/label.png'], complianceLabelStatus: 1 }] }] } },
  } })
  try {
    const d = await compliance.detail(admin({ goodsId: '77' }))
    assert.deepEqual(d.required.map((c) => [c.certType, c.name, c.required, c.status, c.needs]), [[5, "Children's Product Certificate", true, 'Not uploaded', ['Certificate file (expiry date needed)']]])
    assert.deepEqual(d.onFile.map((c) => [c.name, c.rejectReason]), [['Test report', 'Report is expired']])
    assert.deepEqual(d.checks.map((c) => [c.name, c.result, c.reason]), [['Age grading label', 'Missing', 'Add the age label to the photos']])
    assert.deepEqual(d.labels, [{ skuId: '1', images: ['https://t/label.png'] }])
  } finally { restore() }
})

test('a certificate PDF is uploaded then attached', async () => {
  const { compliance, restore, calls } = load({ replies: {
    'bg.arbok.open.upload.uploadFile': { url: 'https://temu.files/cert.pdf' },
    'bg.arbok.open.cert.uploadProductCert': null,
  } })
  try {
    const res = await compliance.uploadCertificate(admin({ goodsId: '77' }, { certType: 5, file: { name: 'cpc.pdf', dataUrl: dataUrl('application/pdf', PDF) }, expiresOn: '2027-12-31' }))
    assert.deepEqual(calls[0], ['bg.arbok.open.upload.uploadFile', { access_token: 'tok', base64File: dataUrl('application/pdf', PDF) }])
    assert.deepEqual(calls[1], ['bg.arbok.open.cert.uploadProductCert', { access_token: 'tok', productId: 77, productCatCertReqList: [{ certType: 5, productCertFiles: [{ fileName: 'cpc.pdf', fileUrl: 'https://temu.files/cert.pdf', expireTime: Date.parse('2027-12-31T23:59:59Z') }] }] }])
    assert.match(res.message, /cpc\.pdf sent to Temu/)
  } finally { restore() }
})

test('a 12 MB certificate, a non-PDF/image file, or a goods of another shop is refused before Temu', async () => {
  const { compliance, restore, calls } = load({ replies: {} })
  try {
    const big = Buffer.concat([PDF, Buffer.alloc(12 * 1024 * 1024)])
    await assert.rejects(compliance.uploadCertificate(admin({ goodsId: '77' }, { certType: 5, file: { name: 'big.pdf', dataUrl: dataUrl('application/pdf', big) } })), (e) => e.status === 400 && /10 MB/.test(e.body.error))
    await assert.rejects(compliance.uploadCertificate(admin({ goodsId: '77' }, { certType: 5, file: { name: 'a.exe', dataUrl: dataUrl('application/octet-stream', Buffer.from('MZ')) } })), (e) => e.status === 400)
    await assert.rejects(compliance.uploadCertificate(admin({ goodsId: '77' }, { file: { name: 'a.pdf', dataUrl: dataUrl('application/pdf', PDF) } })), (e) => e.status === 400)
    assert.equal(calls.length, 0)
  } finally { restore() }
  const other = load({ listing: null, replies: {} })
  try {
    await assert.rejects(other.compliance.detail(admin({ goodsId: '99' })), (e) => e.status === 404)
    assert.equal(other.calls.length, 0)
  } finally { other.restore() }
})

test('on Temu US without the certificate upload methods, the detail says to upload in Seller Center', async () => {
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected', grantedScopes: ['bg.local.goods.detail.query', 'bg.local.goods.compliance.rules.get', 'bg.local.compliance.goods.list.query'] })),
    '/models/Listing': modelStub(() => ({ _id: 'l1', externalListingId: '77:1' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (type) => (type === 'bg.local.goods.detail.query' ? { catId: 1 } : type === 'bg.local.goods.compliance.rules.get' ? { goodsCertList: [{ certType: 5, certName: 'CPC', isRequired: true, uploadStatusLanguageMap: { en: 'Not uploaded' } }] } : (() => { throw new Error(`unexpected ${type}`) })()) },
  })
  try {
    const compliance = freshRequire('marketplaces/temu/app/services/compliance.js')
    const d = await compliance.detail({ user: { role: 'super_admin' }, params: { goodsId: '77' }, query: {}, body: {} })
    assert.equal(d.canUpload, false)
    assert.deepEqual(d.required.map((c) => c.name), ['CPC'])
  } finally { restore() }
})
