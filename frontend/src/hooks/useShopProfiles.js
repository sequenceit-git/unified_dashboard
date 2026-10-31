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

export function listingFilters(profile) {
  const statuses = profile?.statuses || {}
  return [
    { value: 'all', label: 'All listings' },
    ...['live', 'out_of_stock', 'pending', 'paused', 'ended', 'error']
      .filter((key) => statuses[key])
      .map((key) => ({ value: key, label: statuses[key].label })),
  ]
}
