export const SHOP_SECTIONS = [
  { id: 'ebay', marketplace: 'ebay', label: 'eBay' },
  { id: 'tiktok', marketplace: 'tiktok_shop', label: 'TikTok Shop' },
  { id: 'temu', marketplace: 'temu', label: 'Temu Shop' },
]

export function shopSectionFromId(id) {
  return SHOP_SECTIONS.find((section) => section.id === id) || null
}

export function shopSectionFromMarketplace(marketplace) {
  return SHOP_SECTIONS.find((section) => section.marketplace === marketplace) || null
}

export function canonicalShopMarketplace(value) {
  if (value === 'tiktok') return 'tiktok_shop'
  if (value === 'ebay' || value === 'tiktok_shop' || value === 'temu') return value
  return 'ebay'
}
