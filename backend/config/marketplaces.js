/**
 * Unified Marketplace API Configuration
 * Configuration for eBay, TikTok Shop, and Temu Developer APIs.
 */

const MARKETPLACE_CONFIG = {
  ebay: require('../marketplaces/ebay/config'),
  tiktok_shop: require('../marketplaces/tiktok_shop/config'),
  temu: require('../marketplaces/temu/config'),
}

module.exports = MARKETPLACE_CONFIG

