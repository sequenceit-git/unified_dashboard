/**
 * "Who pays shipping" on an eBay listing: `{ paidBy: 'buyer' | 'seller', cost }` as the backend
 * takes it (`ebayShipping`). Free shipping makes the first service free; the buyer pays the typed
 * cost on a flat-rate listing, or eBay's calculated rate on a calculated one.
 */

const COST_MISSING = 'Enter the shipping cost the buyer pays.'

/** A new listing: keep the shop's own shipping (copied from its live listings) until the seller picks. */
export const NEW_LISTING_SHIPPING = Object.freeze({ paidBy: '', cost: '', type: 'Flat', policy: '' })

/** The form's starting value from a product (synced from eBay); '' (keep the shop's shipping) when unknown. */
export function shippingPayerFrom(product) {
  const s = product?.ebayShipping || {}
  return {
    paidBy: s.paidBy === 'seller' || s.paidBy === 'buyer' ? s.paidBy : '',
    cost: s.paidBy === 'buyer' && s.cost != null ? String(s.cost) : '',
    type: s.type === 'Calculated' ? 'Calculated' : 'Flat',
    policy: s.policy || '',
  }
}

/** An error message, or '' when the choice can be sent. */
export function validateShippingPayer(value, type = value?.type || 'Flat') {
  if (value?.paidBy !== 'buyer' || type === 'Calculated') return ''
  return Number(value.cost) >= 0.01 ? '' : COST_MISSING
}

/** What is sent to the API; undefined when nothing was chosen. */
export function cleanShippingPayer(value) {
  if (value?.paidBy === 'seller') return { paidBy: 'seller' }
  if (value?.paidBy === 'buyer') return { paidBy: 'buyer', ...(value.cost !== '' && value.cost != null ? { cost: Number(value.cost) } : {}) }
  return undefined
}

/** Whether the seller changed who pays shipping (the edit form only sends a change). */
export function shippingPayerChanged(before, after) {
  return JSON.stringify(cleanShippingPayer(before) || null) !== JSON.stringify(cleanShippingPayer(after) || null)
}
