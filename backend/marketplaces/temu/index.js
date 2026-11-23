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
}
