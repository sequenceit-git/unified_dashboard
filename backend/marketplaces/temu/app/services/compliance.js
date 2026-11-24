/**
 * Temu goods compliance for the US site: which goods have certificates Temu wants, a goods'
 * required certificates (Temu's own status text), certificates on file with their review result,
 * Temu's compliance checks, compliance labels, and uploading a certificate file. EU-only data
 * (GPSR, EU responsible persons/representatives) is not handled.
 */
const Listing = require('../../../../models/Listing')
const marketplaceManager = require('../manager')
const { HttpError } = require('../../../../utils/httpError')
const { grantAware } = require('../../sections/helpers')
const { goodsShop } = require('./goodsHelpers')

const MAX_FILE = 10 * 1024 * 1024
const enText = (map) => (map && typeof map === 'object' ? map.en || map['en-US'] || Object.values(map)[0] : '') || ''

/** The connected Temu shop that lists this goods, and its token runner. */
async function forGoods(ctx, goodsId) {
  if (!/^\d+$/.test(String(goodsId || ''))) throw new HttpError(400, { error: 'goodsId must be a Temu goods id' })
  const shop = await goodsShop(ctx)
  const listing = await Listing.findOne({ shopId: shop._id, marketplace: 'temu', externalListingId: { $in: [String(goodsId), new RegExp(`^${goodsId}:`)] } })
  if (!listing) throw new HttpError(404, { error: 'This shop has no such Temu goods' })
  return shop
}

function run(shop, fn) {
  const temu = require('../../service')
  const call = (method, params = {}) => (token) => grantAware(shop, method, () => temu.call(method, { access_token: token, ...params }))()
  return marketplaceManager.withShopToken(shop, (token) => fn((method, params) => call(method, params)(token)))
}

/** GET /compliance — goods with compliance items on Temu (all pages, up to 20 × 50). */
async function list(ctx) {
  const shop = await goodsShop(ctx)
  return run(shop, async (call) => {
    const rows = []
    for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
      const res = await call('bg.local.compliance.goods.list.query', { pageNo, pageSize: 50 })
      rows.push(...(res.goodsList || []))
      if (!(res.goodsList || []).length || rows.length >= (res.total ?? 0)) break
    }
    return rows.map((g) => ({
      goodsId: String(g.goodsId),
      title: g.goodsName || '',
      image: g.thumbUrl || '',
      certificates: (g.certificateInfoList || []).length,
    }))
  })
}

/** GET /:goodsId/compliance — required certificates, certificates on file, checks and labels. */
async function detail(ctx) {
  const goodsId = String(ctx.params.goodsId)
  const shop = await forGoods(ctx, goodsId)
  return run(shop, async (call) => {
    const goods = await call('bg.local.goods.detail.query', { goodsId: Number(goodsId) })
    const [rules, onFile, labels] = await Promise.all([
      call('bg.local.goods.compliance.rules.get', { goodsId: Number(goodsId), catId: goods.catId }),
      call('bg.arbok.open.product.cert.query', { productId: Number(goodsId) }).catch(() => ({ productCertList: [] })),
      call('bg.goods.compliancelabel.get', { productIds: [Number(goodsId)], page: 1, pageSize: 50 }).catch(() => ({ pageResult: { data: [] } })),
    ])
    const required = await Promise.all((rules.goodsCertList || []).map(async (c) => {
      const items = await call('bg.arbok.open.cert.queryNeedUploadItems', { certType: c.certType, productId: Number(goodsId) }).catch(() => ({ certNeedUploadItems: [] }))
      return {
        certType: c.certType,
        name: c.certName || `Certificate ${c.certType}`,
        required: Boolean(c.isRequired),
        status: enText(c.uploadStatusLanguageMap) || `Status ${c.uploadStatus}`,
        needs: (items.certNeedUploadItems || []).map((i) => `${i.aliasName}${i.hasExpireTime ? ' (expiry date needed)' : ''}`),
      }
    }))
    return {
      goodsId,
      required,
      onFile: (onFile.productCertList || []).map((c) => ({ certType: c.certType, name: c.certName || `Certificate ${c.certType}`, auditStatus: c.auditStatus, rejectReason: c.rejectReason || '' })),
      checks: (rules.checkInfoList || []).map((c) => ({ name: c.checkShowName || c.checkName || '', result: c.checkResultDesc || '', reason: c.checkFailReason || '' })),
      labels: ((labels.pageResult?.data || []).find((d) => String(d.productId) === goodsId)?.skuComplianceLabels || []).map((l) => ({ skuId: String(l.productSkuId), images: l.complianceLabelPics || [] })),
    }
  })
}

/** A certificate sent from the dashboard (`{ name, dataUrl }`): PDF, JPEG or PNG by its bytes, up to 10 MB; never stored. */
function certificateFile(file) {
  const m = /^data:[^;,]*;base64,(.*)$/s.exec(String(file?.dataUrl || ''))
  if (!m) throw new HttpError(400, { error: 'Choose the certificate file (PDF, JPEG or PNG).' })
  const buf = Buffer.from(m[1], 'base64')
  const kind = buf.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf'
    : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
      : buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'image/png' : null
  if (!kind) throw new HttpError(400, { error: 'Temu takes certificates as PDF, JPEG or PNG.' })
  if (buf.length > MAX_FILE) throw new HttpError(400, { error: 'The certificate is larger than 10 MB.' })
  const name = String(file.name || '').replace(/[^\w.\- ]/g, '').slice(0, 100) || 'certificate'
  return { name, dataUrl: `data:${kind};base64,${m[1]}` }
}

/** POST /:goodsId/certificates { certType, file, expiresOn? } — uploads the file to Temu, then attaches it. */
async function uploadCertificate(ctx) {
  const goodsId = String(ctx.params.goodsId)
  const certType = Number(ctx.body?.certType)
  if (!Number.isInteger(certType) || certType <= 0) throw new HttpError(400, { error: 'Choose which certificate this is.' })
  const file = certificateFile(ctx.body?.file)
  const expires = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.body?.expiresOn || '')) ? Date.parse(`${ctx.body.expiresOn}T23:59:59Z`) : null
  const shop = await forGoods(ctx, goodsId)
  return run(shop, async (call) => {
    const { url } = await call('bg.arbok.open.upload.uploadFile', { base64File: file.dataUrl })
    if (!url) throw new HttpError(502, { error: 'Temu did not accept the file.' })
    await call('bg.arbok.open.cert.uploadProductCert', {
      productId: Number(goodsId),
      productCatCertReqList: [{ certType, productCertFiles: [{ fileName: file.name, fileUrl: url, ...(expires ? { expireTime: expires } : {}) }] }],
    })
    return { message: `${file.name} sent to Temu. Temu reviews it; the result shows here.` }
  })
}

module.exports = { list, detail, uploadCertificate, certificateFile }
