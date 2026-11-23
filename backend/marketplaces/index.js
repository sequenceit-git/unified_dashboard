// @ts-check
/**
 * Marketplace registry: the one list of shops. Each shop lives in `marketplaces/<key>/`.
 * Adapters load lazily, so requiring the registry never pulls in a shop's API code.
 */
const { checkAdapter } = require('./contract')

/** @typedef {import('./contract').Adapter} Adapter */

/** Marketplace keys, in display order. Same values as `Shop.marketplace` in the database. */
const KEYS = ['ebay', 'tiktok_shop', 'temu']

/**
 * @param {string} key
 * @returns {Adapter}
 */
function get(key) {
  if (!KEYS.includes(key)) throw new Error(`Unknown marketplace ${key}`)
  return require(`./${key}`)
}

/** @returns {Adapter[]} */
function all() {
  return KEYS.map(get)
}

/** @returns {Record<string, string>} key → display name */
function labels() {
  return Object.fromEntries(all().map((adapter) => [adapter.key, adapter.label]))
}

/** Throws when a shop's adapter is missing a required member. Called once at server start. */
function assertAdapters() {
  for (const key of KEYS) {
    const missing = checkAdapter(get(key))
    if (missing.length) throw new Error(`Marketplace ${key} is missing: ${missing.join(', ')}`)
  }
}

module.exports = { KEYS, get, all, labels, assertAdapters }
