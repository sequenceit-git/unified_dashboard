export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
]

// Labels for marketplaces that appear on records (e.g. customer support
// conversations) even where no store connection exists yet.
const EXTRA_LABELS = {
  temu: 'Temu',
  tiktok_shop: 'TikTok Shop',
}

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || EXTRA_LABELS[id] || id
}

export function marketplaceBadgeColor(id) {
  if (id === 'ebay') return 'blue'
  if (id === 'tiktok_shop') return 'purple'
  if (id === 'temu') return 'yellow'
  return 'gray'
}
