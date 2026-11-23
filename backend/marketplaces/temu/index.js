// @ts-check
// Temporary adapter: points at today's files. Replaced when temu moves into this folder.
const { PROFILES } = require('../../services/marketplace/profiles')
const { LOADERS } = require('../../services/marketplace/sections')

/** @type {import('../contract').Adapter} */
module.exports = {
  key: 'temu',
  label: PROFILES.temu.label,
  config: require('../../config/marketplaces').temu,
  service: require('../../services/marketplace/temu'),
  profile: PROFILES.temu,
  sections: LOADERS.temu,
}
