// @ts-check
// Temporary adapter: points at today's files. Replaced when tiktok_shop moves into this folder.
const { PROFILES } = require('../../services/marketplace/profiles')
const { LOADERS } = require('../../services/marketplace/sections')

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'tiktok_shop',
  label: PROFILES.tiktok_shop.label,
  config: require('../../config/marketplaces').tiktok_shop,
  service: require('../../services/marketplace/tiktok'),
  profile: PROFILES.tiktok_shop,
  sections: LOADERS.tiktok_shop,
}
