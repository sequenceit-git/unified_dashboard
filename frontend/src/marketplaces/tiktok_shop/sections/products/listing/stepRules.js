/** Checks the browser's number fields used to make (now done by the step rules), and step ordering. */

/** A stock count must be whole. */
export function wholeStockError(value) {
  if (value == null || String(value).trim() === '') return ''
  return Number.isInteger(Number(value)) ? '' : 'Stock must be a whole number.'
}

/** A price may have at most 2 decimals. */
export function centsError(value) {
  return /\.\d{3,}$/.test(String(value ?? '').trim()) ? 'Price can have at most 2 decimals.' : ''
}

/** Problems sorted by the order of the steps that fix them. */
export function inStepOrder(problems, steps) {
  const at = new Map(steps.map((s, i) => [s.id, i]))
  return [...(problems || [])].sort((a, b) => (at.get(a.step) ?? 99) - (at.get(b.step) ?? 99))
}
