export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
]

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || id
}

export function marketplaceBadgeColor(id) {
  if (id === 'ebay') return 'blue'
  return 'gray'
}
