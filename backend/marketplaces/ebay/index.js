// @ts-check
// Temporary adapter: points at today's files. Replaced when ebay moves into this folder.
const { PROFILES } = require('../../services/marketplace/profiles')
const { LOADERS } = require('../../services/marketplace/sections')

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'ebay',
  label: PROFILES.ebay.label,
  config: require('../../config/marketplaces').ebay,
  service: require('../../services/marketplace/ebay'),
  profile: PROFILES.ebay,
  sections: LOADERS.ebay,
}
