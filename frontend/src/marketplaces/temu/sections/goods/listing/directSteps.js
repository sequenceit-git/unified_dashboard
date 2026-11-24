/** Temu Direct listing: read a page, check what was found (Temu's own form takes over for the rest). */

export const TEMU_DIRECT_STEPS = [
  { id: 'link', label: 'Product link' },
  { id: 'found', label: 'Check what was found' },
]

/** The save checks (the same as before, plus whole stock and cents), all on "Check what was found". */
export function directProblems(s) {
  const out = []
  const add = (message) => message && out.push({ step: 'found', message })
  if (!String(s.title || '').trim()) add('Add a title.')
  else if (String(s.title).length > s.titleMax) add(`${s.shopLabel} titles can be at most ${s.titleMax} characters.`)
  if (!(Number(s.price) > 0)) add('Set your selling price.')
  else if (/\.\d{3,}$/.test(String(s.price).trim())) add('Price can have at most 2 decimals.')
  if (String(s.stock ?? '').trim() !== '' && !Number.isInteger(Number(s.stock))) add('Stock must be a whole number.')
  if (!s.images) add('Add at least one image.')
  if (s.packageRequired && !(Number(s.weight) > 0)) add(`${s.shopLabel} needs the package weight and size.`)
  if (s.missingRequired?.length) add(`Fill in: ${s.missingRequired.join(', ')}.`)
  return out
}
