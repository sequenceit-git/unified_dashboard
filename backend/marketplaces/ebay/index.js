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
  /** The shop's app: dashboard API, sync jobs, listing pushes (loaded on first use, after every adapter). */
  /** Section ids renamed to this shop's own API names (old → new): old URLs and stored ids follow it. */
  renamedSections: { products: 'listings', finances: 'payouts', customers: 'buyers', returns: 'returns-cases', inbox: 'messages' },
  get app() { return require('./app') },
  aiHint: 'This listing is for eBay. Fill item specifics buyers filter by (Brand, Type, Color, Size, Material, Model, Capacity). Every value must be a string.',
  importer: require('./importItem'),
  skuPrefix: 'EBAY',
  buyer: { fallbackEmail: (username) => `${String(username).toLowerCase()}@members.ebay.com` },
  configStatus: (config) => ({
    configured: Boolean(config.clientId && config.clientSecret),
    environment: config.environment || 'PRODUCTION',
    ruNameConfigured: Boolean(config.ruName),
  }),
  /**
   * Added scopes this shop hasn't granted yet, with the feature each turns on: a reconnect asks for
   * them. A shop connected before scopes were recorded holds the base ones.
   */
  missingScopes(shop) {
    const config = require('./config')
    const held = new Set(shop?.grantedScopes?.length ? shop.grantedScopes : config.baseScopes)
    const FEATURES = {
      'sell.analytics.readonly': 'Listing traffic and seller level',
      'sell.finances.earnings.read': 'Order earnings',
      'sell.payment.dispute': 'Payment disputes',
      'commerce.feedback': 'Feedback',
    }
    return config.extraScopes.filter((scope) => !held.has(scope)).map((scope) => {
      const short = scope.replace('https://api.ebay.com/oauth/api_scope/', '')
      return { scope: short, feature: FEATURES[short] || short }
    })
  },
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
