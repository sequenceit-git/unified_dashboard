/**
 * The Temu listing form's own logic (Temu US): the starting form from a dashboard product, the
 * attributes that apply (a child shows only once its parent value triggers it), the SKU rows made
 * from the chosen variant values, the same checks the backend makes (goodsPayload.js), and Temu's
 * refusal mapped back to the fields — the form itself is never cleared.
 */

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''
const oneDecimal = (v) => Number((Math.round(Number(v) * 10) / 10).toFixed(1))
// Temu US site limits: lb and in, one decimal; base price from $0.02.
export const US = { weight: [0.1, 9999.9], size: [0.1, 999.9], minPrice: 0.02 }

/** The form a dashboard product starts from (category, attributes and variants are picked on Temu's terms). */
export function formFromProduct(product = {}) {
  return {
    catId: null,
    catPath: '',
    title: product.title || '',
    description: product.description || '',
    bulletPoints: [],
    outGoodsSn: product.sku || '',
    images: product.images || [],
    shippingTemplateId: '',
    handlingDays: 2,
    attributes: {},
    variantGroups: [],
    variants: [],
    brand: null,
    taxCode: '',
    defaults: {
      basePrice: product.basePrice != null ? String(product.basePrice) : '',
      quantity: product.stock != null ? String(product.stock) : '',
      weight: product.weight != null ? String(product.weight) : '',
      length: product.dimensions?.length != null ? String(product.dimensions.length) : '',
      width: product.dimensions?.width != null ? String(product.dimensions.width) : '',
      height: product.dimensions?.height != null ? String(product.dimensions.height) : '',
      images: (product.images || []).slice(0, 1),
    },
  }
}

// A child's parent: by refPid (showCondition), or by templatePid (controlType 1/3/16, Temu's guide 20).
const parentAttr = (attr, template) => (template.attributes || []).find((a) => (attr.parent.templatePid != null ? a.templatePid === attr.parent.templatePid : a.refPid === attr.parent.refPid))

function applies(attr, template, form) {
  if (!attr.parent) return true
  const parent = parentAttr(attr, template)
  if (!parent || !applies(parent, template, form)) return false
  return (form.attributes?.[parent.templatePid]?.vids || []).some((vid) => attr.parent.vids.includes(vid))
}

/** The values a child attribute may take for the parent values chosen (all of them otherwise). */
export function allowedValues(attr, template, form) {
  if (!attr.parent?.allowed) return attr.values || []
  const chosen = form.attributes?.[parentAttr(attr, template)?.templatePid]?.vids || []
  const ok = new Set(attr.parent.allowed.filter((a) => a.parentVids.some((v) => chosen.includes(v))).flatMap((a) => a.vids))
  return (attr.values || []).filter((v) => ok.has(v.vid))
}

/** The attributes to show now. */
export function visibleAttributes(template, form) {
  return (template?.attributes || []).filter((a) => applies(a, template, form))
}

// The same SKU whatever order its variant types come in.
const keyOf = (specs) => specs.map((s) => s.specId).sort((a, b) => a - b).join(',')

/**
 * One SKU per combination of the chosen values (`groups` = per variant type, its chosen values).
 * A combination already in `previous` keeps what was typed for it; a new one starts from the product.
 */
export function skusFor(groups, previous = [], form = {}) {
  const used = groups.filter((g) => g.length)
  if (!used.length) return []
  const combos = used.reduce((acc, group) => acc.flatMap((specs) => group.map((v) => [...specs, v])), [[]])
  const old = new Map(previous.map((s) => [keyOf(s.specs), s]))
  const d = form.defaults || {}
  return combos.map((specs) => old.get(keyOf(specs)) || {
    specs,
    outSkuSn: form.outGoodsSn ? `${form.outGoodsSn}-${specs.map((s) => s.value).join('-')}`.replace(/\s+/g, '').slice(0, 100) : '',
    basePrice: d.basePrice || '',
    listPrice: '',
    quantity: d.quantity || '',
    weight: d.weight || '',
    length: d.length || '',
    width: d.width || '',
    height: d.height || '',
    images: d.images || [],
  })
}

const within = (v, [min, max]) => filled(v) && oneDecimal(v) >= min && oneDecimal(v) <= max

/** `{ field: message }` — the same checks as the backend's goodsPayload.formErrors. */
export function validate(form, template) {
  const e = {}
  if (!form.catId) e.catId = 'Choose a Temu category.'
  const title = String(form.title || '').trim()
  if (!title) e.title = 'Enter a title.'
  else if (title.length > 500) e.title = 'Titles are at most 500 characters.'
  const bullets = (form.bulletPoints || []).filter(filled)
  if (bullets.length > 6 || bullets.join('').length > 700) e.bulletPoints = 'Up to 6 bullet points, 700 characters in all.'
  if (String(form.description || '').length > 10000) e.description = 'Descriptions are at most 10,000 characters.'
  if (!(form.images || []).length) e.images = 'Add at least one photo.'
  if (!filled(form.shippingTemplateId)) e.shippingTemplateId = 'Choose a shipping template.'
  for (const a of visibleAttributes(template, form)) {
    const v = form.attributes?.[a.templatePid]
    const at = `attributes.${a.templatePid}`
    if (a.required && !((v?.vids || []).length || filled(v?.value))) e[at] = `${a.name} is required.`
    else if ((a.units || []).length && filled(v?.value) && !(v.vids || []).length && !a.units.some((u) => u.id === v.unitId)) e[at] = `Choose a unit for ${a.name}.`
  }
  if (filled(form.handlingDays) && !(Number.isInteger(Number(form.handlingDays)) && Number(form.handlingDays) >= 1)) e._ = 'Handling time is a whole number of days.'
  if (!(form.variants || []).length) e.variants = 'Choose at least one variant value.'
  ;(form.variants || []).forEach((v, i) => {
    const at = (f) => `variants.${i}.${f}`
    if (!(Number(v.basePrice) >= US.minPrice)) e[at('basePrice')] = 'Enter a price of at least $0.02.'
    if (filled(v.listPrice) && Number(v.listPrice) < Number(v.basePrice)) e[at('listPrice')] = 'The list price can not be below the price.'
    const q = Number(v.quantity)
    if (!filled(v.quantity) || !Number.isInteger(q) || q < 0 || q > 999999) e[at('quantity')] = 'Stock is a whole number from 0 to 999,999.'
    if (!within(v.weight, US.weight)) e[at('weight')] = 'Enter the weight: 0.1–9,999.9 lb.'
    if (![v.length, v.width, v.height].every((x) => within(x, US.size))) e[at('size')] = 'Enter length, width and height: 0.1–999.9 in.'
    if (!(v.images || []).length) e[at('images')] = 'Add a photo for this SKU.'
  })
  return e
}

// Fields the form shows a message next to; anything else goes to the message at the top (`_`).
const SHOWN = /^(catId|title|images|shippingTemplateId|bulletPoints|variants|attributes\.\d+|variants\.\d+\.(basePrice|listPrice|quantity|weight|size|images))$/

/** Temu's refusal (the list route's 422 body) by field; whatever has no place on the form goes under `_`. */
export function problemsByField(body = {}) {
  const out = {}
  const loose = []
  for (const p of body.problems || []) {
    if (!p?.message) continue
    if (p.field && SHOWN.test(p.field)) { if (!out[p.field]) out[p.field] = p.message } else loose.push(p.message)
  }
  if (loose.length) out._ = [...new Set(loose)].join(' ')
  else if (!Object.keys(out).length && body.error) out._ = body.error
  return out
}

/** The request's `temuForm`, with every photo swapped for Temu's own url (`temuUrl(source)`). */
export function toTemuForm(form, temuUrl) {
  return {
    catId: form.catId,
    title: form.title.trim(),
    description: form.description,
    bulletPoints: (form.bulletPoints || []).filter(filled),
    outGoodsSn: form.outGoodsSn,
    images: form.images.map(temuUrl),
    shippingTemplateId: form.shippingTemplateId,
    handlingDays: Number(form.handlingDays) || 2,
    attributes: form.attributes,
    variants: form.variants.map((v) => ({ ...v, images: (v.images || []).map(temuUrl) })),
    ...(form.brand ? { brand: form.brand } : {}),
    ...(form.taxCode ? { taxCode: form.taxCode } : {}),
  }
}
