export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
  { id: 'temu', label: 'Temu' },
  { id: 'tiktok_shop', label: 'TikTok' },
]

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || id
}

export function marketplaceBadgeColor(id) {
  if (id === 'ebay') return 'blue'
  if (id === 'temu') return 'yellow'
  if (id === 'tiktok_shop') return 'purple'
  return 'gray'
}
