/** Listing ids and match keys shared by the sync core and the shop hooks. */

function productKey(id) {
  return String(id || '').split(':')[0]
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function listingAliases(id) {
  const value = String(id || '')
  if (!value) return []
  if (value.includes(':')) return [value]
  const key = productKey(value)
  return [...new Set([value, key].filter(Boolean))]
}

function ignoreTokens(...values) {
  const tokens = new Set()
  for (const value of values.flat()) {
    const text = String(value || '').trim()
    if (!text) continue
    tokens.add(text)
    tokens.add(text.toLowerCase())
  }
  return [...tokens]
}

module.exports = { productKey, escapeRegex, listingAliases, ignoreTokens }
