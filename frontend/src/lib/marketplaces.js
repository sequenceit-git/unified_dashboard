export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
  { id: 'temu', label: 'Temu' },
  { id: 'tiktok_shop', label: 'TikTok' },
]

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || id
}
