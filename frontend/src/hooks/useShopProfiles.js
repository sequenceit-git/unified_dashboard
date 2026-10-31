import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'

let cache = null
let inflight = null
const listeners = new Set()

function load(token, refresh = false) {
  if (!refresh && cache) return Promise.resolve(cache)
  if (!refresh && inflight) return inflight
  inflight = api.get(`/api/shops/profiles${refresh ? '?refresh=1' : ''}`, token)
    .then((list) => {
      cache = list
      listeners.forEach((listener) => listener(list))
      return list
    })
    .finally(() => { inflight = null })
  return inflight
}

/**
 * Each marketplace's dashboard profile: sidebar sections (with API availability), its own
 * listing status names and product form settings. Loaded once and shared by every caller.
 */
export function useShopProfiles() {
  const { token } = useAuth()
  const [profiles, setProfiles] = useState(cache)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return undefined
    listeners.add(setProfiles)
    load(token).then(setProfiles).catch((err) => setError(err.message))
    return () => listeners.delete(setProfiles)
  }, [token])

  const refresh = useCallback(() => load(token, true), [token])
  return { profiles, error, refresh }
}

export function useShopProfile(marketplace) {
  const { profiles, ...rest } = useShopProfiles()
  return { profile: profiles?.find((item) => item.marketplace === marketplace) || null, ...rest }
}

/**
 * The shop's own name and badge color for a listing, e.g. TikTok "Frozen" from the raw code.
 * Out of stock and ended are worked out by the dashboard, so they keep the normalized name.
 */
export function listingBadge(profile, listing) {
  if (!listing) return null
  const derived = listing.status === 'out_of_stock' || listing.status === 'ended'
  return (!derived && profile?.rawStatuses?.[listing.marketplaceStatus])
    || profile?.statuses?.[listing.status]
    || { label: listing.status, color: 'gray' }
}

/** Listing filter options using the shop's own status names. */
/** Shop actions (end, unpublish, publish…) that apply to this listing's current state. */
export function listingActionsFor(profile, listing) {
  if (!listing) return []
  return (profile?.listingActions || []).filter((action) => {
    if (listing.marketplaceStatus && action.raw?.includes(listing.marketplaceStatus)) return true
    return action.statuses.includes(listing.status)
  })
}

const DIRECT_DEFAULTS = {
  ebay: {
    titleMax: 80,
    maxImages: 12,
    condition: true,
    specifics: { label: 'Item specifics', hint: 'eBay asks for different specifics per category. Brand is always sent.' },
    package: 'optional',
    packageNote: 'Used by eBay for calculated shipping. Skip if your store already has defaults.',
    category: 'search',
    intro: 'This form uses the eBay listing format: 80-character title, condition, category, and item specifics.',
  },
  tiktok_shop: {
    titleMax: 255,
    maxImages: 9,
    condition: false,
    specifics: { label: 'Product attributes', hint: 'TikTok asks for attributes per category. Missing required ones keep the product in draft.' },
    package: 'required',
    packageNote: 'TikTok needs package weight and size to make shipping labels.',
    category: 'auto',
    intro: 'This form uses the TikTok Shop format: longer title, required package size, and category attributes. New products go to review.',
  },
  temu: {
    titleMax: 250,
    maxImages: 10,
    condition: false,
    specifics: null,
    package: 'hidden',
    packageNote: '',
    category: 'text',
    intro: 'Save the goods to the catalog. Publishing to Temu from EcomPilot is not available yet.',
  },
}

/**
 * Direct-listing and product-form layout for this shop. Profile and listing API
 * capabilities override defaults, but eBay / TikTok / Temu never share one template.
 */
export function listingFormFor(marketplace, profile, caps = {}) {
  const fallback = DIRECT_DEFAULTS[marketplace] || DIRECT_DEFAULTS.ebay
  const form = profile?.productForm || {}
  const packageMode = form.packageDetails
    ? (form.packageDetails.required ? 'required' : 'optional')
    : caps.packageDetails
      ? fallback.package
      : fallback.package
  return {
    titleMax: form.titleMax || caps.titleMax || fallback.titleMax,
    maxImages: form.maxImages || caps.maxImages || fallback.maxImages,
    condition: form.condition ?? caps.condition ?? fallback.condition,
    specifics: form.specifics === null ? null : (form.specifics || fallback.specifics),
    package: packageMode,
    packageNote: form.packageDetails?.note || fallback.packageNote,
    category: caps.categorySearch ? 'search' : caps.categoryAutoPick ? 'auto' : fallback.category,
    canList: caps.canList !== false && marketplace !== 'temu',
    listAction: form.listAction || (marketplace === 'tiktok_shop' ? 'Publish to TikTok Shop' : `List on ${profile?.label || 'shop'}`),
    apiName: caps.apiName || '',
    note: caps.note || '',
    intro: fallback.intro,
    label: profile?.label || fallback.intro.split(' ')[3] || 'Shop',
  }
}

export function listingFilters(profile) {
  const statuses = profile?.statuses || {}
  return [
    { value: 'all', label: 'All listings' },
    ...['live', 'out_of_stock', 'pending', 'paused', 'ended', 'error']
      .filter((key) => statuses[key])
      .map((key) => ({ value: key, label: statuses[key].label })),
  ]
}
