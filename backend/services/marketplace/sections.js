/**
 * Read-only data for the shop-specific sections (returns, finances, promotions, ...).
 * Each loader returns `{ summary: [{label, value, type}], tables: [{id, title, columns, rows}] }`
 * so one page can render any shop's section. Column types: text, money, date, number, status, link.
 */


const LOADERS = { ebay: require('../../marketplaces/ebay/sections'), tiktok_shop: require('../../marketplaces/tiktok_shop/sections'), temu: require('../../marketplaces/temu/sections') }

function hasLoader(marketplace, sectionId) {
  return typeof LOADERS[marketplace]?.[sectionId] === 'function'
}

function load(marketplace, sectionId, token, shop) {
  return LOADERS[marketplace][sectionId](token, shop)
}

module.exports = { hasLoader, load, LOADERS }
