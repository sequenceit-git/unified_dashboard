export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: 'ebay', label: 'eBay' },
]

// Labels for marketplaces that appear on records (e.g. customer support
// conversations) even where no store connection exists yet.
const EXTRA_LABELS = {
  temu: 'Temu',
  tiktok_shop: 'TikTok Shop',
  tiktok: 'TikTok Shop',
  amazon: 'Amazon',
  walmart: 'Walmart',
  etsy: 'Etsy',
  wish: 'Wish',
  shopify: 'Shopify store',
}

export function marketplaceLabel(id) {
  return MARKETPLACES.find((m) => m.id === id)?.label || EXTRA_LABELS[id] || id
}

export const EVIDENCE_LABELS = {
  T1: 'Confirmed sales',
  T2: 'Official rank or badge',
  T3: 'Platform sold count',
  T4: 'Demand proxy only',
  T5: 'Unverified signal',
}

export function marketplaceBadgeColor(id) {
  if (id === 'ebay') return 'blue'
  if (id === 'tiktok_shop' || id === 'tiktok') return 'purple'
  if (id === 'temu') return 'yellow'
  return 'gray'
}
