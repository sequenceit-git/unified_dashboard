import { SHOPS, KEYS } from '../marketplaces'

export const SHOP_SECTIONS = SHOPS.map((shop) => ({ id: shop.urlId, marketplace: shop.key, label: shop.label }))

export function shopSectionFromId(id) {
  return SHOP_SECTIONS.find((section) => section.id === id) || null
}

export function shopSectionFromMarketplace(marketplace) {
  return SHOP_SECTIONS.find((section) => section.marketplace === marketplace) || null
}

export function canonicalShopMarketplace(value) {
  if (value === 'tiktok') return 'tiktok_shop'
  if (KEYS.includes(value)) return value
  return KEYS[0]
}
