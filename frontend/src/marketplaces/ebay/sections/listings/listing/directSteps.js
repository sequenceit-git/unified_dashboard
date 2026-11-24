/** The Direct listing steps and its save checks (the same as before), each on the step that fixes it. */
import { validateBestOffer, validateEbayIdentifierCode, validateVariantsForEbay } from './rules'
import { validateShippingPayer } from './shippingPayer'

export const DIRECT_STEPS = [
  { id: 'link', label: 'Product link' },
  { id: 'found', label: 'Check what was found' },
  { id: 'category', label: 'Category & specifics' },
  { id: 'price', label: 'Price & shipping' },
  { id: 'review', label: 'Review' },
]

export function directProblems(s) {
  const out = []
  const add = (step, message) => message && out.push({ step, message })
  if (!String(s.title || '').trim()) add('found', 'Add a title.')
  else if (String(s.title).length > s.titleMax) add('found', `${s.shopLabel} titles can be at most ${s.titleMax} characters.`)
  if (String(s.subtitle || '').length > s.subtitleMax) add('found', `eBay subtitles can be at most ${s.subtitleMax} characters.`)
  if (!s.images) add('found', 'Add at least one image.')
  if (s.variants?.length) {
    add('price', validateVariantsForEbay(s.variants, { requireStock: true }))
  } else {
    if (!(Number(s.price) > 0)) add('price', 'Set your selling price.')
    if (s.canList && !(Number(s.stock) >= 1)) add('price', 'Set stock to at least 1 before listing.')
    if (s.upcRequired && !String(s.identifierCode?.code || '').trim()) add('price', 'This eBay category requires a product identifier (or click "Does not apply").')
    else add('price', validateEbayIdentifierCode(s.identifierCode))
  }
  if (s.bestOfferAllowed) add('price', validateBestOffer(s.bestOffer, s.variants?.length ? s.summaryPrice : Number(s.price)))
  add('price', validateShippingPayer(s.ebayShipping))
  if (s.packageRequired && !(Number(s.weight) > 0)) add('price', `${s.shopLabel} needs the package weight and size.`)
  if (s.needsCategory && !s.categoryId) add('category', `Pick a ${s.shopLabel} category.`)
  if (s.missingRequired?.length) add('category', `Fill in: ${s.missingRequired.join(', ')}.`)
  if (s.canList && !s.hasShop) add('review', `Connect ${s.shopLabel} in Settings first.`)
  return out
}
