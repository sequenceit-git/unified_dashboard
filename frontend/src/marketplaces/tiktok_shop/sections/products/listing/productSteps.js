/** The TikTok Shop product form's steps and every problem it has, each pointing to the step that fixes it. */
import { validateIdentifierCode, validateVariantsForTikTok } from './rules'
import { centsError, inStepOrder, wholeStockError } from './stepRules'

export const PRODUCT_STEPS = [
  { id: 'photos', label: 'Photos' },
  { id: 'basics', label: 'Basics' },
  { id: 'specifics', label: 'Attributes' },
  { id: 'variations', label: 'Variations' },
  { id: 'price', label: 'Price & stock' },
  { id: 'package', label: 'Package' },
  { id: 'review', label: 'Review' },
]

const empty = (v) => v == null || String(v).trim() === ''

/** `{ step, field, message }` for each problem. `opts`: titleMax, packageRequired. */
export function productProblems(form, variants = [], opts = {}) {
  const out = []
  const add = (step, field, message) => message && out.push({ step, field, message })
  const title = String(form.title || '')
  if (!title.trim()) add('basics', 'title', 'Enter a title.')
  else if (opts.titleMax && title.length > opts.titleMax) add('basics', 'title', `TikTok Shop titles can be at most ${opts.titleMax} characters (now ${title.length}).`)
  if (variants.length) {
    add('variations', 'variants', validateVariantsForTikTok(variants, { requireStock: false }))
  } else {
    add('basics', 'identifierCode', validateIdentifierCode(form.identifierCode))
    if (empty(form.basePrice)) add('price', 'basePrice', 'Enter a price.')
    else add('price', 'basePrice', centsError(form.basePrice))
    if (empty(form.stock)) add('price', 'stock', 'Enter the stock quantity.')
    else add('price', 'stock', wholeStockError(form.stock))
    // TikTok's MSRP / list price: at least the price, at most $7,600.
    const list = Number(form.listPrice)
    const price = Number(form.basePrice)
    if (!empty(form.listPrice) && list > 0 && price > 0 && (list < price || list > 7600)) {
      add('price', 'listPrice', `MSRP / list price must be between $${price.toFixed(2)} and $7,600.00.`)
    }
  }
  if (opts.packageRequired) {
    for (const field of ['weight', 'length', 'width', 'height']) {
      if (!(Number(form[field]) >= 0.1)) add('package', field, `Enter the package ${field} (at least 0.1).`)
    }
  }
  return inStepOrder(out, PRODUCT_STEPS)
}

export function stepsWithProblems(problems) {
  return new Set((problems || []).map((p) => p.step))
}
