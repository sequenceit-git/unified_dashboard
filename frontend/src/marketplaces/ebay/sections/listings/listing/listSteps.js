/** The List on eBay form's steps and its publish checks, each pointing to the step that fixes it. */
import { validateBestOffer, validateEbayIdentifierCode, validateVariantsForEbay } from './rules'
import { validateShippingPayer } from './shippingPayer'

export const LIST_STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'category', label: 'Category & specifics' },
  { id: 'price', label: 'Price, stock & variations' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'review', label: 'Review & list' },
]

/** `{ step, message }` for each reason the listing can't be published yet (same checks as before). */
export function listProblems(s) {
  const out = []
  const add = (step, message) => message && out.push({ step, message })
  if (!s.hasShop) add('details', 'Choose a shop to list on.')
  else if (!s.canList) add('details', s.canListNote || 'Listing on this shop is not available.')
  if (!String(s.title || '').trim()) add('details', 'Title is required.')
  else if (String(s.title).length > s.titleMax) add('details', `eBay titles can be at most ${s.titleMax} characters.`)
  if (String(s.subtitle || '').length > s.subtitleMax) add('details', `eBay subtitles can be at most ${s.subtitleMax} characters.`)
  if (!s.images) add('details', 'Add at least one photo.')
  if (s.needsCategory && !s.categoryId) add('category', 'Choose an eBay category.')
  if (s.missingRequired?.length) add('category', `Fill in: ${s.missingRequired.join(', ')}.`)
  if (s.variants?.length) {
    add('price', validateVariantsForEbay(s.variants, { requireStock: true }))
  } else {
    if (!(Number(s.price) > 0)) add('price', 'Set a price above 0.')
    if (!(Number(s.stock) >= 1)) add('price', 'Stock must be at least 1 to list a product.')
    if (s.upcRequired && !String(s.identifierCode?.code || '').trim()) add('price', 'This eBay category requires a product identifier (or click "Does not apply").')
    else add('price', validateEbayIdentifierCode(s.identifierCode))
  }
  if (s.bestOfferAllowed) add('price', validateBestOffer(s.bestOffer, s.variants?.length ? s.summaryPrice : Number(s.price)))
  add('shipping', validateShippingPayer(s.ebayShipping))
  return out
}
