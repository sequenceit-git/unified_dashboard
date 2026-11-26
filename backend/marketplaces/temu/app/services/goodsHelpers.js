/**
 * Temu listing helpers (Temu's release flow, product/00-how-to-release-product.md): categories,
 * the category's attribute/variant template, custom variant ids, photo upload, shipping templates,
 * brands, tax codes, net-content units, and the pre-checks (banned words, duplicate codes).
 * Served under /api/temu/goods/helpers/* for the user's connected Temu shop.
 */
const Shop = require('../../../../models/Shop')
const marketplaceManager = require('../manager')
const cache = require('../../../../services/core/cache')
const { HttpError } = require('../../../../utils/httpError')
const { canUseSection } = require('../../../../middleware/auth')
const { grantAware } = require('../../sections/helpers')
const { mapTemplate } = require('../../goodsTemplate')

const TTL = 10 * 60

/** The user's connected Temu shop, after the Goods access check. */
async function goodsShop(ctx) {
  if (!canUseSection(ctx.authUser || ctx.user, 'temu', 'goods', 'products')) throw new HttpError(403, { error: 'You do not have access to Goods on this shop' })
  const filter = { marketplace: 'temu', status: 'connected' }
  if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
  const shop = await Shop.findOne(filter)
  if (!shop) throw new HttpError(404, { error: 'No connected Temu shop' })
  return shop
}

/** Runs one granted Temu call for the shop. */
async function temuCall(ctx, method, params = {}) {
  const shop = await goodsShop(ctx)
  const temu = require('../../service')
  return marketplaceManager.withShopToken(shop, (token) => grantAware(shop, method, () => temu.call(method, { access_token: token, ...params }))())
}
const shopKey = async (ctx) => String((await goodsShop(ctx))._id)
const intParam = (value, name) => {
  if (!/^\d+$/.test(String(value ?? ''))) throw new HttpError(400, { error: `${name} must be a Temu id` })
  return Number(value)
}

/** GET helpers/categories?parentId= — one level of Temu's category tree (no parent: the top). */
async function categories(ctx) {
  const parentId = ctx.query.parentId ? intParam(ctx.query.parentId, 'parentId') : null
  const key = `temu:cats:${await shopKey(ctx)}:${parentId ?? 'top'}`
  const res = await cache.wrap(key, TTL, () => temuCall(ctx, 'bg.local.goods.cats.get', parentId != null ? { parentCatId: parentId } : {}))
  return (res.goodsCatsList || []).map((c) => ({ id: c.catId, name: c.catName, leaf: Boolean(c.leaf), apparel: c.catType === 0, available: c.availableStatus === 0 }))
}

/** GET helpers/categories/recommend?title= — Temu's category suggestions for a title. */
async function recommend(ctx) {
  const goodsName = String(ctx.query.title || '').trim()
  if (!goodsName) throw new HttpError(400, { error: 'Enter a title first' })
  const res = await temuCall(ctx, 'bg.local.goods.category.recommend', { goodsName })
  return res.catIdList || (res.catId ? [res.catId] : [])
}

/** GET helpers/template?catId= — the category's attributes, variant types and size-chart rule. */
async function template(ctx) {
  const catId = intParam(ctx.query.catId, 'catId')
  const key = `temu:template:${await shopKey(ctx)}:${catId}`
  return cache.wrap(key, TTL, async () => {
    const [t, size] = await Promise.all([
      temuCall(ctx, 'bg.local.goods.template.get', { catId }),
      temuCall(ctx, 'bg.local.goods.size.element.get', { catId }).catch(() => null),
    ])
    return mapTemplate(t, size)
  })
}

/** POST helpers/spec { catId, parentSpecId, name } — Temu's id for a custom variant value. */
async function spec(ctx) {
  const name = String(ctx.body?.name || '').trim()
  if (!name) throw new HttpError(400, { error: 'Enter the variant value' })
  const res = await temuCall(ctx, 'bg.local.goods.spec.id.get', { catId: intParam(ctx.body?.catId, 'catId'), parentSpecId: intParam(ctx.body?.parentSpecId, 'parentSpecId'), childSpecName: name })
  return { specId: res.specId }
}

/**
 * POST helpers/images { urls } — Temu fetches each photo from its public address (the dashboard's
 * own uploads or any https image) and returns its own url, which goods must use.
 */
async function uploadImages(ctx) {
  const urls = (Array.isArray(ctx.body?.urls) ? ctx.body.urls : []).map((u) => String(u || '').trim()).filter(Boolean).slice(0, 49)
  if (!urls.length) throw new HttpError(400, { error: 'Add at least one photo' })
  const publicUrls = marketplaceManager.publicImageUrls(urls)
  if (publicUrls.length !== urls.length) throw new HttpError(400, { error: 'Photos need a public https address (upload them to the dashboard first).' })
  const out = []
  for (let i = 0; i < urls.length; i += 1) {
    const res = await temuCall(ctx, 'bg.local.goods.image.upload', { fileUrl: publicUrls[i] })
    out.push({ source: urls[i], url: res.url })
  }
  return out
}

/** GET helpers/shipping-templates — the shop's shipping templates (made in Seller Center). */
async function shippingTemplates(ctx) {
  const res = await cache.wrap(`temu:ship-templates:${await shopKey(ctx)}`, TTL, () => temuCall(ctx, 'bg.freight.template.list.query'))
  return (res.templateList || []).map((t) => ({ id: t.templateId, name: t.templateName }))
}

/** GET helpers/brands — brands registered for the shop. */
async function brands(ctx) {
  const res = await cache.wrap(`temu:brands:${await shopKey(ctx)}`, TTL, () => temuCall(ctx, 'temu.local.goods.brand.trademark.V2.get', { page: 1, size: 100 }))
  return (res.trademarkList || []).map((b) => ({ brandId: b.brandId, trademarkId: b.trademarkId, name: b.brandName || b.trademarkName }))
}

/** GET helpers/tax-codes?catId= */
async function taxCodes(ctx) {
  const catId = intParam(ctx.query.catId, 'catId')
  const res = await cache.wrap(`temu:tax-codes:${await shopKey(ctx)}:${catId}`, TTL, () => temuCall(ctx, 'bg.local.goods.tax.code.get', { catId }))
  return (res.itemTaxCodeList || []).map((t) => ({ code: t.itemTaxCode, name: t.itemTaxCodeDesc, suggested: Boolean(t.isSuggest) }))
}

/** GET helpers/net-units */
async function netUnits(ctx) {
  const res = await cache.wrap(`temu:net-units:${await shopKey(ctx)}`, TTL, () => temuCall(ctx, 'temu.local.goods.sku.net.content.unit.query'))
  return (res.netContentUnitTypeDTOList || []).flatMap((t) => (t.netContentUnitDTOList || []).map((u) => ({ code: u.code, name: u.value, type: t.value })))
}

const oneDecimal = (v) => String(Number((Math.round(Number(v) * 10) / 10).toFixed(1)))

/**
 * POST helpers/price-suggestion { catId, shippingTemplateId, variants: [{ specIds, weight, length,
 * width, height }] } — Temu's recommended base price per SKU of a goods being listed (US: lb, in).
 */
async function priceSuggestion(ctx) {
  const b = ctx.body || {}
  const variants = (Array.isArray(b.variants) ? b.variants : []).filter((v) => Array.isArray(v.specIds) && v.specIds.length)
  if (!variants.length) throw new HttpError(400, { error: 'Choose the variant values first.' })
  const res = await temuCall(ctx, 'temu.local.goods.baseprice.recommend', {
    supplierPriceEstimateQry: {
      goodsBasicInfo: { catId: intParam(b.catId, 'catId'), ...(b.shippingTemplateId ? { costTemplateId: String(b.shippingTemplateId) } : {}) },
      supplierPriceEstimateSkuQryList: variants.map((v) => ({
        specIdList: v.specIds.map(Number),
        productDimensionsInfo: { weight: oneDecimal(v.weight), weightUnit: 'lb', length: oneDecimal(v.length), width: oneDecimal(v.width), height: oneDecimal(v.height), dimensionUnit: 'in' },
      })),
    },
  })
  const list = res.supplierPriceEstimateInfo?.skuEstimateInfoList || []
  return variants.map((v) => {
    const hit = list.find((e) => (e.specIdList || []).map(Number).sort().join(',') === v.specIds.map(Number).sort().join(','))
    const p = hit?.recommendBasePriceInfo
    return { specIds: v.specIds.map(Number), price: p?.amount != null ? { value: Number(p.amount), currency: p.currency || 'USD' } : null }
  })
}

const FIELD = { goodsName: 'title', goodsDesc: 'description', bulletPoints: 'bulletPoints' }

/** POST helpers/check — Temu's banned-word check and duplicate goods/SKU codes, per form field. */
async function check(ctx) {
  const b = ctx.body || {}
  const problems = []
  const words = await temuCall(ctx, 'temu.local.goods.illegal.vocabulary.check', {
    goodsName: String(b.title || ''),
    ...(b.description ? { goodsDesc: String(b.description) } : {}),
    ...(Array.isArray(b.bulletPoints) && b.bulletPoints.length ? { bulletPoints: b.bulletPoints.map(String) } : {}),
  })
  for (const f of words.failReasonList || []) {
    for (const w of f.violationWarningContentList || []) problems.push({ field: FIELD[f.violationItem] || f.violationItem, message: w.warning || w.violationType })
  }
  if (b.outGoodsSn) {
    const res = await temuCall(ctx, 'bg.local.goods.out.sn.check', { outGoodsSnList: [String(b.outGoodsSn)] })
    for (const r of res.resultList || []) if (r.isDuplicate) problems.push({ field: 'outGoodsSn', message: `${r.outGoodsSn} is already used by Temu goods ${r.duplicateGoodsId}.` })
  }
  const skus = (Array.isArray(b.skus) ? b.skus : []).map(String).filter(Boolean)
  if (skus.length) {
    const res = await temuCall(ctx, 'bg.local.goods.sku.out.sn.check', { outSkuSnList: skus })
    for (const r of res.resultList || []) if (r.isDuplicate) problems.push({ field: 'skus', message: `${r.outSkuSn} is already used by Temu SKU ${r.duplicateSkuId}.` })
  }
  return { problems }
}

module.exports = { goodsShop, priceSuggestion, categories, recommend, template, spec, uploadImages, shippingTemplates, brands, taxCodes, netUnits, check }
