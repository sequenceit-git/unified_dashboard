/**
 * Turns the dashboard's Temu listing form into Temu's bg.local.goods.add body (Temu's release
 * guide, product/00-how-to-release-product.md). Pure: no Temu calls.
 *
 * form = { catId, title, description, bulletPoints[], images[] (Temu urls),
 *   shippingTemplateId, handlingDays, attributes: { [templatePid]: { vids?: [], value?, unitId? } },
 *   variants: [{ specs: [{ parentSpecId, specId, vid?, value }], basePrice, listPrice?,
 *     quantity, weight, weightUnit, length, width, height, volumeUnit, images[],
 *     externalProductType?, externalProductId? }], brand?: { brandId, trademarkId }, taxCode?,
 *   origin?: { region1, region2? } }
 * template = the helpers' template (attributes / variants with templatePid, refPid, parent, units).
 * No seller SKU / goods codes are sent: Temu's own SKU ids are the SKUs.
 * Amounts are whole currency units ("9.99"), as everywhere for Temu. Temu US site: weight in lb,
 * sizes in inches (one decimal), base price at least $0.02.
 */

const CURRENCY = 'USD'
const MAX_TITLE = 500
const MAX_BULLETS = 6
const MAX_BULLET_CHARS = 700
const MAX_DESC = 10000
const MAX_QTY = 999999
// Temu US site (28-product-differences-site-currency-volume.md): lb and in, one decimal.
const WEIGHT = { unit: 'lb', min: 0.1, max: 9999.9 }
const SIZE = { unit: 'in', min: 0.1, max: 999.9 }
const MIN_PRICE = 0.02
const oneDecimal = (v) => String(Number((Math.round(Number(v) * 10) / 10).toFixed(1)))
const within = (v, r) => filled(v) && Number(oneDecimal(v)) >= r.min && Number(oneDecimal(v)) <= r.max

const money = (v) => ({ amount: Number(v).toFixed(2), currency: CURRENCY })
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''

/** An attribute's parent attribute (by refPid, or by templatePid for controlType 1/3/16). */
const parentAttr = (attr, template) => (template.attributes || []).find((a) => (attr.parent.templatePid != null ? a.templatePid === attr.parent.templatePid : a.refPid === attr.parent.refPid))

/** Whether an attribute applies: no parent, or its parent attribute has one of the trigger values. */
function applies(attr, template, form) {
  if (!attr.parent) return true
  const parent = parentAttr(attr, template)
  if (!parent || !applies(parent, template, form)) return false
  const chosen = form.attributes?.[parent.templatePid]?.vids || []
  return chosen.some((vid) => attr.parent.vids.includes(vid))
}

/** The child values the chosen parent values allow (null: any of the attribute's values). */
function allowedVids(attr, template, form) {
  if (!attr.parent?.allowed) return null
  const chosen = form.attributes?.[parentAttr(attr, template)?.templatePid]?.vids || []
  return [...new Set(attr.parent.allowed.filter((a) => a.parentVids.some((v) => chosen.includes(v))).flatMap((a) => a.vids))]
}

const hasValue = (entry) => Boolean(entry && ((entry.vids || []).length || filled(entry.value)))

/** Every problem with the form, by field (`attributes.<templatePid>`, `variants.<i>.<field>`). */
function formErrors(form, template) {
  const errors = []
  const add = (field, message) => errors.push({ field, message })
  if (!form.catId) add('catId', 'Choose a Temu category.')
  const title = String(form.title || '').trim()
  if (!title) add('title', 'Enter a title.')
  else if (title.length > MAX_TITLE) add('title', `Titles are at most ${MAX_TITLE} characters.`)
  const bullets = (form.bulletPoints || []).filter(filled)
  if (bullets.length > MAX_BULLETS || bullets.join('').length > MAX_BULLET_CHARS) add('bulletPoints', `Up to ${MAX_BULLETS} bullet points, ${MAX_BULLET_CHARS} characters in all.`)
  if (String(form.description || '').length > MAX_DESC) add('description', `Descriptions are at most ${MAX_DESC} characters.`)
  if (!(form.images || []).length) add('images', 'Add at least one photo.')
  if (!filled(form.shippingTemplateId)) add('shippingTemplateId', 'Choose a shipping template.')
  if (filled(form.handlingDays) && !(Number.isInteger(Number(form.handlingDays)) && Number(form.handlingDays) >= 1)) add('handlingDays', 'Handling time is a whole number of days.')
  for (const attr of template.attributes || []) {
    if (!applies(attr, template, form)) continue
    const entry = form.attributes?.[attr.templatePid]
    const field = `attributes.${attr.templatePid}`
    if (attr.required && !hasValue(entry)) { add(field, `${attr.name} is required.`); continue }
    const allowed = allowedVids(attr, template, form)
    const wrong = allowed ? (entry?.vids || []).filter((vid) => !allowed.includes(vid)) : []
    if (wrong.length) {
      const parent = parentAttr(attr, template)
      add(field, `${(attr.values || []).find((v) => v.vid === wrong[0])?.value || wrong[0]} is not allowed for ${attr.name} with this ${parent?.name || 'choice'}.`)
    } else if ((attr.units || []).length && filled(entry?.value) && !(entry.vids || []).length && !attr.units.some((u) => u.id === entry.unitId)) {
      add(field, `Choose a unit for ${attr.name}.`)
    }
  }
  const variants = form.variants || []
  if (!variants.length) add('variants', 'Add at least one SKU.')
  const seen = new Set()
  variants.forEach((v, i) => {
    const at = (f) => `variants.${i}.${f}`
    if (!(v.specs || []).length) add(at('specs'), 'Choose the variant values of this SKU.')
    if (!filled(v.basePrice) || !(Number(v.basePrice) >= MIN_PRICE)) add(at('basePrice'), `Enter a price of at least $${MIN_PRICE.toFixed(2)}.`)
    if (filled(v.listPrice) && Number(v.listPrice) < Number(v.basePrice)) add(at('listPrice'), 'The list price can not be below the price.')
    const qty = Number(v.quantity)
    if (!filled(v.quantity) || !Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) add(at('quantity'), `Stock is a whole number from 0 to ${MAX_QTY}.`)
    if (!within(v.weight, WEIGHT)) add(at('weight'), `Enter the weight: ${WEIGHT.min}–${WEIGHT.max} lb.`)
    if (![v.length, v.width, v.height].every((d) => within(d, SIZE))) add(at('size'), `Enter length, width and height: ${SIZE.min}–${SIZE.max} in.`)
    if (!(v.images || []).length) add(at('images'), 'Add a photo for this SKU.')
    const key = (v.specs || []).map((s) => s.specId).sort().join(',')
    if (key && seen.has(key)) add(at('specs'), 'Two SKUs have the same variant values.')
    seen.add(key)
  })
  return errors
}

/** Temu's goodsProperties: the attributes that apply, then every variant value the SKUs use. */
function goodsProperties(form, template) {
  const out = []
  for (const attr of template.attributes || []) {
    const entry = form.attributes?.[attr.templatePid]
    if (!hasValue(entry) || !applies(attr, template, form)) continue
    const base = { templatePid: attr.templatePid, refPid: attr.refPid }
    if ((entry.vids || []).length) {
      for (const vid of entry.vids) out.push({ ...base, vid, value: (attr.values || []).find((v) => v.vid === vid)?.value ?? '' })
    } else {
      const unit = (attr.units || []).find((u) => u.id === entry.unitId)
      out.push({ ...base, value: String(entry.value).trim(), ...(unit ? { valueUnitId: unit.id, valueUnit: unit.name } : {}) })
    }
  }
  const seen = new Set()
  for (const v of form.variants || []) {
    for (const s of v.specs || []) {
      if (seen.has(s.specId)) continue
      seen.add(s.specId)
      const type = (template.variants || []).find((t) => t.parentSpecId === s.parentSpecId)
      out.push({
        ...(type ? { templatePid: type.templatePid, refPid: type.refPid } : {}),
        parentSpecId: s.parentSpecId,
        specId: s.specId,
        ...(s.vid != null ? { vid: s.vid } : {}),
        value: s.value,
      })
    }
  }
  return out
}

/** Temu's bg.local.goods.add body; throws `{ status: 400, problems }` when the form isn't complete. */
function buildGoodsAdd(form, template) {
  const problems = formErrors(form, template)
  if (problems.length) throw Object.assign(new Error(problems.map((p) => p.message).join(' ')), { status: 400, problems })
  const bullets = (form.bulletPoints || []).map((b) => String(b).trim()).filter(Boolean)
  return {
    goodsBasic: {
      catId: Number(form.catId),
      goodsName: String(form.title).trim(),
      goodsGallery: { goodsCarouselImage: form.images, detailImage: form.images },
    },
    goodsServicePromise: { costTemplateId: String(form.shippingTemplateId), fulfillmentType: 1, shipmentLimitDay: Number(form.handlingDays) || 2 },
    goodsProperty: { goodsProperties: goodsProperties(form, template) },
    skuList: form.variants.map((v) => ({
      specIdList: v.specs.map((s) => s.specId),
      quantity: Number(v.quantity),
      // No list price: Temu's listPriceType 1 (none needed).
      price: { basePrice: money(v.basePrice), ...(filled(v.listPrice) ? { listPrice: money(v.listPrice) } : { listPriceType: 1 }) },
      weight: oneDecimal(v.weight),
      weightUnit: WEIGHT.unit,
      length: oneDecimal(v.length),
      width: oneDecimal(v.width),
      height: oneDecimal(v.height),
      volumeUnit: SIZE.unit,
      images: v.images,
      ...(v.externalProductType && filled(v.externalProductId) ? { externalProductType: Number(v.externalProductType), externalProductId: String(v.externalProductId).trim() } : {}),
    })),
    ...(bullets.length ? { bulletPoints: bullets } : {}),
    ...(filled(form.description) ? { goodsDesc: String(form.description).trim() } : {}),
    ...(form.brand?.brandId ? { goodsTrademark: { brandId: form.brand.brandId, trademarkId: form.brand.trademarkId } } : {}),
    ...(filled(form.taxCode) ? { taxCodeInfo: { itemTaxCode: String(form.taxCode) } } : {}),
    goodsOriginInfo: form.origin?.region1
      ? { originRegion1: form.origin.region1, ...(form.origin.region2 ? { originRegion2: form.origin.region2 } : {}) }
      : { agreeDefaultOriginRegion: true },
  }
}

module.exports = { buildGoodsAdd, formErrors, applies, allowedVids }
