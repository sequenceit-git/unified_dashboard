// @ts-check
/**
 * What every shop folder (`marketplaces/<key>/index.js`) exports. The shared core only talks to a
 * shop through this object.
 *
 * @typedef {Object} Adapter
 * @property {string} key        Marketplace key, as stored in the database: 'ebay' | 'tiktok_shop' | 'temu'
 * @property {string} label      Display name ("eBay", "TikTok Shop", "Temu Shop")
 * @property {Object} config     This shop's settings from the environment (URLs, keys, scopes)
 * @property {Object} service    The shop's API service: orders, listings, actions (getOrders, updateStock, ...)
 * @property {Object} profile    Sidebar sections, listing statuses, product-form rules
 * @property {Record<string, (token: string, shop?: Object) => Promise<Object>>} sections  Section id → loader
 * @property {Object} [webhooks]      Optional: { handle, enable, ... } for push notifications
 * @property {Object} [hooks]         Optional: shop-specific steps inside the shared sync
 * @property {Object} [capabilities]  Optional flags read by the shared core:
 *   inbox, inboxNeedsAccountUsername, refreshToken, tracksOrdersSyncedAt, syncsVariants,
 *   relistOnRestock, productKeyListings, listingFetchLimit (number), listingNoun (string)
 * @property {(id: string, saved?: string | null, options?: { status?: string }) => string} [listingUrl]
 */

/** Members every adapter must have. */
const REQUIRED = ['key', 'label', 'config', 'service', 'profile', 'sections']

/** Members an adapter may have; the core checks before using them. */
const OPTIONAL = ['webhooks', 'hooks', 'capabilities', 'routes', 'api', 'importer', 'buyer', 'skuPrefix', 'configStatus', 'aiHint']

/**
 * @param {Partial<Adapter> | null | undefined} adapter
 * @returns {string[]} names of missing required members (empty when the adapter is complete)
 */
function checkAdapter(adapter) {
  const a = /** @type {Record<string, unknown>} */ (adapter || {})
  return REQUIRED.filter((name) => a[name] === undefined || a[name] === null || a[name] === '')
}

module.exports = { REQUIRED, OPTIONAL, checkAdapter }
