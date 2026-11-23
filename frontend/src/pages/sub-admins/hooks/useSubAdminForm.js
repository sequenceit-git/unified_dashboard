/** Sub-admin form state: loading the sub-admin, shop/route/section choices, validation and saving (moved from SubAdminFormPage). */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { api } from '../../../lib/api'
import { useApi } from '../../../hooks/useApi'
import { PLATFORM_ROUTES, MARKETPLACE_SUBSECTIONS } from '../../../lib/access'
import { SHOPS as REGISTRY_SHOPS, KEYS } from '../../../marketplaces'

/** Shop cards for the form, from the marketplace registry (src/marketplaces/<key>/index.js). */
const SHOPS = REGISTRY_SHOPS.map((shop) => ({
  id: shop.key,
  marketplace: shop.key,
  label: shop.theme.subAdminLabel,
  shopName: shop.theme.shopName,
  desc: shop.theme.desc,
  theme: { border: shop.theme.border, bgActive: shop.theme.bgActive, badge: shop.theme.badge, indicator: shop.theme.indicator },
}))

export function useSubAdminForm() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const connectedShops = Array.isArray(shopsRes.data) ? shopsRes.data : []

  const [activeShop, setActiveShop] = useState(KEYS[0])
  const [sectionsByShop, setSectionsByShop] = useState(() => Object.fromEntries(
    KEYS.map((key, i) => [key, i === 0 ? (MARKETPLACE_SUBSECTIONS[key] || []).map((s) => s.id) : []]),
  ))
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('active')
  const [mainRoutes, setMainRoutes] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async () => {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.del(`/api/auth/users/${id}`, token)
      navigate('/sub-admins')
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete sub-admin')
      setDeleteBusy(false)
    }
  }

  // Selected shop config & native subsections for the currently active tab
  const selectedShop = SHOPS.find((s) => s.marketplace === activeShop) || SHOPS[0]
  const nativeSubsections = MARKETPLACE_SUBSECTIONS[activeShop] || []
  const currentShopSections = sectionsByShop[activeShop] || []

  // Initialize or reset form when existing data loads
  useEffect(() => {
    if (existing) {
      setName(existing.name || '')
      setUsername(existing.username || existing.email || '')
      setPassword('')
      setStatus(existing.status || 'active')

      const existingMarkets = Array.isArray(existing.marketplaces) && existing.marketplaces.length > 0
        ? existing.marketplaces
        : [existing.marketplace || KEYS[0]]
      setActiveShop(existingMarkets[0] || KEYS[0])

      const userMainRoutes = Array.isArray(existing.mainRoutes) ? existing.mainRoutes : []
      setMainRoutes(userMainRoutes)

      const rawAllowed = Array.isArray(existing.allowedSections) ? existing.allowedSections : []
      const byShop = Object.fromEntries(KEYS.map((key) => [key, []]))
      const hasScoped = rawAllowed.some((entry) => entry.includes(':'))

      for (const market of KEYS) {
        const native = MARKETPLACE_SUBSECTIONS[market] || []
        const nativeIds = native.map((s) => s.id)

        if (hasScoped) {
          // Scoped mode: only match exact prefix 'ebay:products', 'tiktok_shop:orders', etc.
          byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(`${market}:${subId}`))
        } else if (existingMarkets.length === 1 && existingMarkets[0] === market && rawAllowed.length > 0) {
          // Legacy single-shop with bare IDs
          byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(subId))
        } else {
          // Multi-shop or empty allowedSections: NEVER auto-default to mainRoutes
          byShop[market] = []
        }
      }
      setSectionsByShop(byShop)
    } else {
      // Default: clean slate for new sub-admin, no unwanted default selections
      setSectionsByShop({
        ebay: [],
        tiktok_shop: [],
        temu: [],
      })
      setActiveShop(KEYS[0])
    }
  }, [existing])

  // Switching shop tab keeps previous shop sections intact
  const handleSelectShop = (marketId) => {
    setActiveShop(marketId)
  }

  const togglePlatformRoute = (key) => {
    setMainRoutes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const toggleSection = (sectionId) => {
    setSectionsByShop((prev) => {
      const current = prev[activeShop] || []
      const next = current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
      return { ...prev, [activeShop]: next }
    })
  }

  const selectAllShopSections = () => {
    const subs = MARKETPLACE_SUBSECTIONS[activeShop] || []
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: subs.map((s) => s.id),
    }))
  }

  const clearShopSections = () => {
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: [],
    }))
  }

  const selectAllPermissions = () => {
    setMainRoutes(PLATFORM_ROUTES.map(([k]) => k))
    const subs = MARKETPLACE_SUBSECTIONS[activeShop] || []
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: subs.map((s) => s.id),
    }))
  }

  const clearAllPermissions = () => {
    setMainRoutes([])
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: [],
    }))
  }

  const save = async (event) => {
    event.preventDefault()
    setError('')

    const trimmedName = name.trim()
    const trimmedUsername = username.trim()

    if (!trimmedName || !trimmedUsername) {
      return setError('Name and username/email are required.')
    }
    if (!editing && !password) {
      return setError('Password is required for new sub-admins.')
    }

    // Find active shops that have sections selected
    const activeMarkets = Object.keys(sectionsByShop).filter(
      (m) => (sectionsByShop[m] || []).length > 0
    )
    const finalMarkets = activeMarkets.length > 0 ? activeMarkets : [activeShop]

    // Derive mainRoutes: platform routes + parent routes of all selected subsections across all active shops
    const platformSelected = mainRoutes.filter((r) => PLATFORM_ROUTES.some(([k]) => k === r))
    const shopRoutesSelected = []
    const allAllowedSections = []

    finalMarkets.forEach((market) => {
      const subs = MARKETPLACE_SUBSECTIONS[market] || []
      const selectedIds = sectionsByShop[market] || []
      selectedIds.forEach((id) => {
        allAllowedSections.push(`${market}:${id}`)
        if (finalMarkets.length === 1) {
          allAllowedSections.push(id)
        }
      })
      subs.forEach((s) => {
        if (selectedIds.includes(s.id) && !shopRoutesSelected.includes(s.route)) {
          shopRoutesSelected.push(s.route)
        }
      })
    })

    const uniqueAllowedSections = [...new Set(allAllowedSections)]
    const computedMainRoutes = [...new Set([...platformSelected, ...shopRoutesSelected])]

    if (!computedMainRoutes.length && !uniqueAllowedSections.length) {
      return setError('Please select at least one authorized subsection or platform module.')
    }

    setBusy(true)
    try {
      const body = {
        name: trimmedName,
        username: trimmedUsername,
        email: trimmedUsername,
        status,
        marketplace: finalMarkets[0],
        marketplaces: finalMarkets,
        mainRoutes: computedMainRoutes,
        allowedSections: uniqueAllowedSections,
      }
      if (password) body.password = password

      if (editing) {
        await api.patch(`/api/auth/users/${id}`, body, token)
      } else {
        await api.post('/api/auth/users', { ...body, role: 'sub_admin' }, token)
      }

      navigate('/sub-admins', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return {
    token,
    id,
    navigate,
    editing,
    usersRes,
    shopsRes,
    existing,
    connectedShops,
    activeShop,
    setActiveShop,
    sectionsByShop,
    setSectionsByShop,
    name,
    setName,
    username,
    setUsername,
    password,
    setPassword,
    status,
    setStatus,
    mainRoutes,
    setMainRoutes,
    busy,
    setBusy,
    error,
    setError,
    showDeleteModal,
    setShowDeleteModal,
    deleteBusy,
    setDeleteBusy,
    deleteError,
    setDeleteError,
    handleDelete,
    selectedShop,
    nativeSubsections,
    currentShopSections,
    handleSelectShop,
    togglePlatformRoute,
    toggleSection,
    selectAllShopSections,
    clearShopSections,
    selectAllPermissions,
    clearAllPermissions,
    save,
  }
}
