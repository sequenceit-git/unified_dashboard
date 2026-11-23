// @ts-check
/**
 * TikTok Shop adapter: everything the shared core needs from TikTok Shop. All TikTok code lives in
 * this folder: client.js (signing + auth), orders.js, listings.js, promotions.js, finance.js,
 * inbox.js, analytics.js, webhooks.js, profile.js, sections/, scripts/.
 */

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'tiktok_shop',
  label: 'TikTok Shop',
  config: require('./config'),
  service: require('./service'),
  profile: require('./profile'),
  sections: require('./sections'),
  webhooks: require('./webhooks'),
  listingUrl: require('./listingUrl').listingUrl,
  hooks: require('./hooks'),
  routes: require('./routes'),
  aiHint: 'This listing is for TikTok Shop. Fill product attributes (Brand, Color, Model, Capacity, Material, Number of cups or pieces). Every value must be a string.',
  skuPrefix: 'TTS',
  configStatus: (config) => ({
    configured: Boolean(config.appKey && config.appSecret && config.serviceId),
    environment: 'US',
  }),
  capabilities: {
    inbox: true,
    refreshToken: true,
    tracksOrdersSyncedAt: true,
    syncsVariants: true,
    productKeyListings: true,
    listingFetchLimit: 2000,
  },
}
