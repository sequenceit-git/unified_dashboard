// @ts-check
/**
 * eBay adapter: everything the shared core needs from eBay. All eBay code lives in this folder:
 * client.js (auth + REST fetch), trading.js (XML Trading API), orders.js, listings.js, finance.js,
 * inbox.js, webhooks.js, accountDeletion.js, profile.js, sections/, scripts/.
 */

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'ebay',
  label: 'eBay',
  config: require('./config'),
  service: require('./service'),
  profile: require('./profile'),
  sections: require('./sections'),
  webhooks: require('./webhooks'),
  listingUrl: require('./listingUrl').listingUrl,
  trading: require('./trading'),
  hooks: require('./hooks'),
  routes: require('./routes'),
  /** The shop's dashboard API (loaded when the server mounts it, after every adapter). */
  get api() { return require('./api') },
  aiHint: 'This listing is for eBay. Fill item specifics buyers filter by (Brand, Type, Color, Size, Material, Model, Capacity). Every value must be a string.',
  importer: require('./importItem'),
  skuPrefix: 'EBAY',
  buyer: { fallbackEmail: (username) => `${String(username).toLowerCase()}@members.ebay.com` },
  configStatus: (config) => ({
    configured: Boolean(config.clientId && config.clientSecret),
    environment: config.environment || 'PRODUCTION',
    ruNameConfigured: Boolean(config.ruName),
  }),
  capabilities: {
    inbox: true,
    inboxNeedsAccountUsername: true,
    refreshToken: true,
    tracksOrdersSyncedAt: true,
    syncsVariants: true,
    relistOnRestock: true,
    listingNoun: 'eBay',
  },
}
