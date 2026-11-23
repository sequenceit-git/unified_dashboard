// @ts-check
/**
 * Temu shop adapter: everything the shared core needs from Temu. All Temu code lives in this folder:
 * client.js (signing + router), orders.js, listings.js, webhooks.js, profile.js, sections/, scripts/.
 */

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'temu',
  label: 'Temu Shop',
  config: require('./config'),
  service: require('./service'),
  profile: require('./profile'),
  sections: require('./sections'),
  webhooks: require('./webhooks'),
  listingUrl: require('./listingUrl').listingUrl,
  routes: require('./routes'),
  /** The shop's app: dashboard API, sync jobs, listing pushes (loaded on first use, after every adapter). */
  /** Section ids renamed to this shop's own API names (old → new): old URLs and stored ids follow it. */
  renamedSections: { products: 'goods', fulfillment: 'shipping', prices: 'price-reviews', returns: 'after-sales' },
  get app() { return require('./app') },
  aiHint: 'This listing is for Temu. Keep attributes to the few facts printed on the page. Every value must be a string.',
  skuPrefix: 'TEMU',
  configStatus: (config) => ({
    configured: Boolean(config.appKey && config.appSecret),
    environment: 'US',
  }),
  capabilities: {},
}
