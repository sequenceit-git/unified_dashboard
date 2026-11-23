/** Building blocks for shop section pages: tables that fail independently, columns, value formatting. */

const money = (amount) => (amount && amount.value != null
  ? { value: Number(amount.value), currency: amount.currency || 'USD' }
  : null)
const seconds = (value) => (value ? new Date(Number(value) * (String(value).length > 11 ? 1 : 1000)).toISOString() : null)
const words = (value) => (value ? String(value).replace(/^CS_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '')
const col = (key, label, type = 'text') => ({ key, label, type })

/** Settles each table on its own, so one failing API doesn't hide the others. */
async function tables(list) {
  return Promise.all(list.map(async ({ load, ...table }) => {
    try {
      return { ...table, rows: await load() }
    } catch (err) {
      return { ...table, rows: [], error: err.message }
    }
  }))
}

function firstList(result) {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  return Object.values(result).find(Array.isArray) || []
}

module.exports = { money, seconds, words, col, tables, firstList }
