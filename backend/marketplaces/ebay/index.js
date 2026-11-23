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
  trading: require('./trading'),
}
