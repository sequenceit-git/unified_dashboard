/** The Temu product form's steps and its checks, each on the step that fixes it. */

export const TEMU_PRODUCT_STEPS = [
  { id: 'photos', label: 'Photos' },
  { id: 'basics', label: 'Basics' },
  { id: 'price', label: 'Price & stock' },
  { id: 'package', label: 'Package' },
  { id: 'review', label: 'Review' },
]

const empty = (v) => v == null || String(v).trim() === ''

export function productProblems(form, variants = [], opts = {}) {
  const out = []
  const add = (step, field, message) => message && out.push({ step, field, message })
  const title = String(form.title || '')
  if (!title.trim()) add('basics', 'title', 'Enter a title.')
  else if (opts.titleMax && title.length > opts.titleMax) add('basics', 'title', `Temu titles can be at most ${opts.titleMax} characters.`)
  if (!variants.length) {
    if (empty(form.basePrice)) add('price', 'basePrice', 'Enter a price.')
    else if (/\.\d{3,}$/.test(String(form.basePrice).trim())) add('price', 'basePrice', 'Price can have at most 2 decimals.')
    if (empty(form.stock)) add('price', 'stock', 'Enter the stock quantity.')
    else if (!Number.isInteger(Number(form.stock))) add('price', 'stock', 'Stock must be a whole number.')
  }
  if (opts.packageRequired) {
    for (const field of ['weight', 'length', 'width', 'height']) {
      if (!(Number(form[field]) >= 0.1)) add('package', field, `Enter the package ${field} (at least 0.1).`)
    }
  }
  return out
}
