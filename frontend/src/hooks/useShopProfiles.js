import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'

export const PROFILES_STORAGE_KEY = 'shop-profiles:v1'

let cache = null
let cacheToken = ''
let inflight = null
let inflightToken = ''
let loadSeq = 0
const listeners = new Set()

function readStored(userKey) {
  if (!userKey) return null
  try {
    const raw = sessionStorage.getItem(PROFILES_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userKey !== userKey || !Array.isArray(parsed.list)) return null
    return parsed.list
  } catch {
    return null
  }
}

function writeStored(userKey, list) {
  if (!userKey || !Array.isArray(list)) return
  try {
    sessionStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify({ userKey, list }))
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

function clearStored() {
  try {
    sessionStorage.removeItem(PROFILES_STORAGE_KEY)
  } catch {
    // Ignore storage errors.
  }
}

function load(token, opts = false) {
  if (!token) return Promise.resolve(null)
  const refresh = typeof opts === 'boolean' ? opts : Boolean(opts?.refresh)
  const force = typeof opts === 'boolean' ? opts : Boolean(opts?.force || opts?.refresh)
  const userKey = typeof opts === 'object' && opts ? (opts.userKey || '') : ''
  if (token !== cacheToken) {
    cache = null
    cacheToken = token
  }
  if (token !== inflightToken) {
    inflight = null
    inflightToken = token
  }
  if (!force && cache) return Promise.resolve(cache)
  if (!force && inflight) return inflight
  const requestedToken = token
  const seq = ++loadSeq
  const req = api.get(`/api/shops/profiles${refresh ? '?refresh=1' : ''}`, token)
    .then((list) => {
      if (cacheToken === requestedToken && seq === loadSeq) {
        cache = list
        writeStored(userKey, list)
        listeners.forEach((listener) => listener({ token: requestedToken, userKey, list }))
      }
      return list
    })
    .finally(() => {
      if (inflight === req) inflight = null
    })
  inflight = req
  return req
}

/**
 * Each marketplace's dashboard profile: sidebar sections (with API availability), its own
 * listing status names and product form settings. Loaded once and shared by every caller.
 */
export function useShopProfiles() {
  const { token, user } = useAuth()
  const userKey = user?.id || user?._id || user?.username || user?.email || ''
  const [state, setState] = useState(() => {
    if (!token) return { token: '', userKey: '', list: null }
    if (token === cacheToken && cache) return { token, userKey, list: cache }
    return { token, userKey, list: readStored(userKey) }
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      cache = null
      cacheToken = ''
      inflight = null
      inflightToken = ''
      loadSeq += 1
      clearStored()
      return undefined
    }
    listeners.add(setState)
    load(token, { userKey })
      .then((list) => setState({ token, userKey, list }))
      .catch((err) => setError(err.message))
    return () => listeners.delete(setState)
  }, [token, userKey])

  const profiles = !token
    ? null
    : state.token === token && state.userKey === userKey && state.list
      ? state.list
      : token === cacheToken && cache
        ? cache
        : readStored(userKey)
  const refresh = useCallback(() => load(token, { refresh: true, userKey }), [token, userKey])
  const reload = useCallback(() => load(token, { force: true, userKey }), [token, userKey])
  return { profiles, error, refresh, reload }
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
    if (listing.marketplaceStatus && Array.isArray(action.raw)) return action.raw.includes(listing.marketplaceStatus)
    return action.statuses.includes(listing.status)
  })
}

const DIRECT_DEFAULTS = {
  ebay: {
    titleMax: 80,
    subtitleMax: 55,
    maxImages: 12,
    condition: true,
    specifics: { label: 'Item specifics', hint: 'eBay asks for different specifics per category. Brand is always sent.' },
    package: 'optional',
    packageNote: 'Used by eBay for calculated shipping. Skip if your store already has defaults.',
    category: 'search',
    intro: 'This form uses the eBay listing format: 80-character title, optional subtitle, condition & description, variations, category specifics, identifiers, Best Offer, and handling time.',
  },
  tiktok_shop: {
    titleMax: 255,
    maxImages: 9,
    condition: false,
    specifics: { label: 'Product attributes', hint: 'TikTok asks for attributes per category. Required ones must be filled to publish.' },
    package: 'required',
    packageNote: 'TikTok needs package weight and size to make shipping labels.',
    category: 'auto-search',
    intro: 'This form uses the TikTok Shop format: variants, brand, category attributes, size chart, required package size, and draft or publish mode.',
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
    subtitleMax: form.subtitleMax || caps.subtitleMax || fallback.subtitleMax || 0,
    maxImages: form.maxImages || caps.maxImages || fallback.maxImages,
    condition: form.condition ?? caps.condition ?? fallback.condition,
    conditionDescription: Boolean(form.conditionDescription ?? caps.conditionDescription ?? marketplace === 'ebay'),
    specifics: form.specifics === null ? null : (form.specifics || fallback.specifics),
    package: packageMode,
    packageNote: form.packageDetails?.note || fallback.packageNote,
    category: (caps.categoryAutoPick && caps.categorySearch)
      ? 'auto-search'
      : caps.categorySearch
        ? 'search'
        : caps.categoryAutoPick
          ? 'auto'
          : fallback.category,
    variants: Boolean(form.variants ?? caps.variants ?? ['tiktok_shop', 'ebay'].includes(marketplace)),
    brands: Boolean(caps.brands ?? marketplace === 'tiktok_shop'),
    sizeChart: Boolean(caps.sizeChart ?? marketplace === 'tiktok_shop'),
    identifierCode: Boolean(caps.identifierCode ?? ['tiktok_shop', 'ebay'].includes(marketplace)),
    listPrice: Boolean(caps.listPrice ?? marketplace === 'tiktok_shop'),
    bestOffer: Boolean(form.bestOffer ?? caps.bestOffer ?? marketplace === 'ebay'),
    dispatchTime: Boolean(form.dispatchTime ?? caps.dispatchTime ?? marketplace === 'ebay'),
    mpn: Boolean(form.mpn ?? caps.mpn ?? marketplace === 'ebay'),
    saveModes: caps.saveModes || (marketplace === 'tiktok_shop' ? ['LISTING', 'AS_DRAFT'] : []),
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
