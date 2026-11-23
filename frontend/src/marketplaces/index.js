/**
 * Marketplace registry (frontend): the one list of shops. Each shop's UI lives in
 * src/marketplaces/<key>/ — sidebar subsections, section action buttons, colours, listing
 * defaults. Shared pages ask the registry instead of checking shop names.
 */
import ebay from './ebay'
import tiktokShop from './tiktok_shop'
import temu from './temu'

/** Shops in display order. */
export const SHOPS = [ebay, tiktokShop, temu]

/** Marketplace keys, as stored on shops and orders: 'ebay', 'tiktok_shop', 'temu'. */
export const KEYS = SHOPS.map((shop) => shop.key)

/** A shop's config by key (or URL id like 'tiktok'), or null. */
export function getShop(key) {
  return SHOPS.find((shop) => shop.key === key || shop.urlId === key) || null
}

/** Listing tabs on the Products page. */
export const MARKETPLACES = [
  { id: 'all', label: 'All' },
  { id: ebay.key, label: ebay.label },
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
  return getShop(id)?.badgeColor || 'gray'
}
