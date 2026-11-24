/**
 * Values of eBay action dialog fields: `multiple` option lists give an array, `file` fields give
 * `{ name, type, size, dataUrl }` (sent to the dashboard's API, which passes it on to eBay).
 */

/** Adds or removes one chosen value of a `multiple` field. */
export function toggleOption(list, value) {
  const current = Array.isArray(list) ? list : []
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}

/** Whether a field has what it needs (optional fields always do). */
export function isFilled(field, value) {
  if (field.optional) return true
  if (field.multiple) return Array.isArray(value) && value.length > 0
  if (field.type === 'file') return Boolean(value?.dataUrl)
  return String(value ?? '').trim() !== ''
}

/** Reads a chosen file as a data URL. */
export function fileValue(file, Reader = globalThis.FileReader) {
  return new Promise((resolve, reject) => {
    const reader = new Reader()
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result })
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** The dialog after an action ran: a failure keeps it open (with what was typed) and shows why. */
export function dialogAfter(result) {
  return result?.error ? { open: true, error: result.error } : { open: false, error: '' }
}
