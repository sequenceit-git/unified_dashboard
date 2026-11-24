/** The eBay product form's steps and every problem it has, each pointing to the step that fixes it. */
import { validateBestOffer, validateEbayIdentifierCode, validateVariantsForEbay } from './rules'
import { validateShippingPayer } from './shippingPayer'

export const PRODUCT_STEPS = [
  { id: 'photos', label: 'Photos' },
  { id: 'basics', label: 'Basics' },
  { id: 'specifics', label: 'Item specifics' },
  { id: 'variations', label: 'Variations' },
  { id: 'price', label: 'Price & stock' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'review', label: 'Review' },
]

const empty = (v) => v == null || String(v).trim() === ''

/**
 * `{ step, field, message }` for each problem. `opts`: titleMax, subtitleMax, packageRequired,
 * shippingChanged (who-pays-shipping is checked only when it was changed).
 */
export function productProblems(form, variants = [], opts = {}) {
  const out = []
  const add = (step, field, message) => message && out.push({ step, field, message })
  const title = String(form.title || '')
  if (!title.trim()) add('basics', 'title', 'Enter a title.')
  else if (opts.titleMax && title.length > opts.titleMax) add('basics', 'title', `eBay titles can be at most ${opts.titleMax} characters (now ${title.length}).`)
  if (opts.subtitleMax && String(form.subtitle || '').length > opts.subtitleMax) add('basics', 'subtitle', `eBay subtitles can be at most ${opts.subtitleMax} characters.`)
  if (variants.length) {
    add('variations', 'variants', validateVariantsForEbay(variants, { requireStock: false }))
  } else {
    add('basics', 'identifierCode', validateEbayIdentifierCode(form.identifierCode))
    if (empty(form.basePrice)) add('price', 'basePrice', 'Enter a price.')
    if (empty(form.stock)) add('price', 'stock', 'Enter the stock quantity.')
  }
  const prices = variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
  add('price', 'bestOffer', validateBestOffer(form.bestOffer, variants.length && prices.length ? Math.min(...prices) : Number(form.basePrice)))
  if (opts.shippingChanged) add('shipping', 'ebayShipping', validateShippingPayer(form.ebayShipping))
  if (opts.packageRequired) {
    for (const [field, label] of [['weight', 'weight'], ['length', 'length'], ['width', 'width'], ['height', 'height']]) {
      if (!(Number(form[field]) > 0)) add('shipping', field, `Enter the package ${label}.`)
    }
  }
  return out
}

export function stepsWithProblems(problems) {
  return new Set((problems || []).map((p) => p.step))
}
