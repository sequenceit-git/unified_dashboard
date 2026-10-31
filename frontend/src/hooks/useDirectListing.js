import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

function emptySession() {
  return {
    url: '',
    useAi: true,
    fetching: false,
    draft: null,
    stock: 1,
    weight: 1,
    length: 10,
    width: 10,
    height: 5,
    schema: [],
    aspects: {},
    extras: [],
    categories: [],
    categoryId: '',
    categoryState: { loading: false, error: '' },
    fillingAttributes: false,
    error: '',
    saving: false,
  }
}

const sessions = new Map()
const listeners = new Set()
const fetches = new Map()

function sessionOf(marketplace) {
  if (!marketplace) return emptySession()
  if (!sessions.has(marketplace)) sessions.set(marketplace, emptySession())
  return sessions.get(marketplace)
}

function emit(marketplace) {
  listeners.forEach((listener) => listener(marketplace))
}

function patch(marketplace, updates) {
  if (!marketplace) return emptySession()
  const next = { ...sessionOf(marketplace), ...typeof updates === 'function' ? updates(sessionOf(marketplace)) : updates }
  sessions.set(marketplace, next)
  emit(marketplace)
  return next
}

export function peekDirectListing(marketplace) {
  return sessionOf(marketplace)
}

export function hasDirectListingWork(marketplace) {
  const session = sessionOf(marketplace)
  return Boolean(session.fetching || session.saving || session.draft || String(session.url || '').trim())
}

export function clearDirectListing(marketplace) {
  if (!marketplace) return
  sessions.set(marketplace, emptySession())
  emit(marketplace)
}

export function startDirectFetch(marketplace, { url, useAi, token, titleMax, attributeMap }) {
  if (!marketplace || fetches.has(marketplace)) return fetches.get(marketplace)
  const link = String(url || '').trim()
  if (!link) return Promise.resolve()
  patch(marketplace, { fetching: true, error: '', url: link, useAi })
  const job = api.post('/api/products/import-url', { url: link, useAi, marketplace }, token)
    .then((data) => {
      const attrs = attributeMap(data.attributes)
      patch(marketplace, {
        fetching: false,
        error: '',
        draft: {
          ...data,
          title: String(data.title || '').slice(0, titleMax),
          price: data.price ?? '',
          brand: data.brand || attrs.Brand || '',
          condition: data.condition || 'NEW',
          attributes: attrs,
        },
        schema: [],
        aspects: {},
        extras: Object.entries(attrs).map(([name, value]) => ({ name, value })),
        categories: [],
        categoryId: '',
        categoryState: { loading: false, error: '' },
        fillingAttributes: false,
      })
    })
    .catch((err) => {
      patch(marketplace, { fetching: false, error: err.message })
    })
    .finally(() => fetches.delete(marketplace))
  fetches.set(marketplace, job)
  return job
}

export function useDirectListing(marketplace) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = (id) => {
      if (!marketplace || id === marketplace) setTick((n) => n + 1)
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [marketplace])

  const update = useCallback((updates) => patch(marketplace, updates), [marketplace])
  return { session: sessionOf(marketplace), update }
}
