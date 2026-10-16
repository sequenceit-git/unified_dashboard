export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
  { id: 'tiktok_shop', label: 'TikTok Shop' },
  { id: 'temu', label: 'Temu Shop' },
]

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || id
}

export function marketplaceBadgeColor(id) {
  if (id === 'ebay') return 'blue'
  if (id === 'tiktok_shop' || id === 'tiktok') return 'gray'
  if (id === 'temu') return 'orange'
  return 'gray'
}
