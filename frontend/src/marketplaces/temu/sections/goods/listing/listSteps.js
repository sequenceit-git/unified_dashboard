/** The Temu listing form's steps, and which step fixes each error field (the form's checks and Temu's answers). */

export const TEMU_LIST_STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'category', label: 'Category & properties' },
  { id: 'skus', label: 'SKUs & price' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'review', label: 'Review & list' },
]

function stepOf(field, message) {
  if (['title', 'images', 'bulletPoints', 'description'].includes(field)) return 'basics'
  if (field === 'catId' || field.startsWith('attributes')) return 'category'
  if (field.startsWith('variants')) return 'skus'
  if (field === 'shippingTemplateId' || field === 'handlingDays') return 'shipping'
  if (field === '_' && /handling time/i.test(message)) return 'shipping'
  return 'review'
}

/** `{ step, field, message }` for each error, in step order. */
export function problemsFrom(errors) {
  const order = new Map(TEMU_LIST_STEPS.map((s, i) => [s.id, i]))
  return Object.entries(errors || {})
    .filter(([, message]) => message)
    .map(([field, message], i) => ({ step: stepOf(field, String(message)), field, message: String(message), i }))
    .sort((a, b) => order.get(a.step) - order.get(b.step) || a.i - b.i)
    .map(({ step, field, message }) => ({ step, field, message }))
}
