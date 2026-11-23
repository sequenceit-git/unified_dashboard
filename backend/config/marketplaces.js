/**
 * Each shop's API settings from the environment, by marketplace key (marketplaces/<key>/config.js).
 */
const { KEYS } = require('../marketplaces')

const MARKETPLACE_CONFIG = Object.fromEntries(KEYS.map((key) => [key, require(`../marketplaces/${key}/config`)]))

module.exports = MARKETPLACE_CONFIG
