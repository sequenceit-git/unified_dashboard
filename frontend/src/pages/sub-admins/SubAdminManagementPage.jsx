import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Modal from '../../components/ui/Modal'
import SearchInput from '../../components/ui/SearchInput'
import { useApi } from '../../hooks/useApi'
import { PLATFORM_ROUTES, ROUTE_LABELS, MARKETPLACE_SUBSECTIONS, SUBSECTION_LABELS } from '../../lib/access'
import { SHOP_SECTIONS, shopSectionFromMarketplace } from '../../lib/shops'

const SHOP_THEMES = {
  ebay: {
    label: 'eBay Sub-Admin',
    shortLabel: 'eBay',
    badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    indicator: 'bg-blue-500',
  },
  tiktok_shop: {
    label: 'TikTok Shop Sub-Admin',
    shortLabel: 'TikTok Shop',
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    indicator: 'bg-rose-500',
  },
  temu: {
    label: 'Temu Shop Sub-Admin',
    shortLabel: 'Temu Shop',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    indicator: 'bg-amber-500',
  },
}

function formatDateSafe(val) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function formatDateTimeSafe(val) {
  if (!val) return 'Never'
  const d = new Date(val)
  return isNaN(d.getTime()) ? 'Never' : d.toLocaleString()
}

function AccessPill({ children, variant = 'indigo' }) {
  const styles = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
    gray: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${styles[variant] || styles.indigo}`}>
      {children}
    </span>
  )
}

function choiceCardClass(on) {
  return `flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    on
      ? 'border-indigo-500 bg-indigo-50/80 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40'
      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
  }`
}

function EditAccessModal({ user, token, onClose, onSaved, onDeleted }) {
  const existingMarkets = Array.isArray(user?.marketplaces) && user.marketplaces.length > 0
    ? user.marketplaces
    : [user?.marketplace || 'ebay']
  const [activeShop, setActiveShop] = useState(existingMarkets[0] || 'ebay')
  const [mainRoutes, setMainRoutes] = useState(() => (Array.isArray(user?.mainRoutes) ? user.mainRoutes : []))

  const [sectionsByShop, setSectionsByShop] = useState(() => {
    const rawAllowed = Array.isArray(user?.allowedSections) ? user.allowedSections : []
    const byShop = { ebay: [], tiktok_shop: [], temu: [] }
    const hasScoped = rawAllowed.some((x) => x.includes(':'))

    for (const market of ['ebay', 'tiktok_shop', 'temu']) {
      const native = MARKETPLACE_SUBSECTIONS[market] || []
      const nativeIds = native.map((s) => s.id)

      if (hasScoped) {
        byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(`${market}:${subId}`))
      } else if (existingMarkets.length === 1 && existingMarkets[0] === market && rawAllowed.length > 0) {
        byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(subId))
      } else {
        // Multi-shop without scoped entries or empty allowedSections: NEVER auto-default to mainRoutes
        byShop[market] = []
      }
    }
    return byShop
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const theme = SHOP_THEMES[activeShop] || SHOP_THEMES.ebay
  const nativeSubsections = MARKETPLACE_SUBSECTIONS[activeShop] || []
  const currentShopSections = sectionsByShop[activeShop] || []

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

  const handleSwitchShop = (nextMarket) => {
    setActiveShop(nextMarket)
  }

  const save = async () => {
    setError('')

    const activeMarkets = Object.keys(sectionsByShop).filter(
      (m) => (sectionsByShop[m] || []).length > 0
    )
    const finalMarkets = activeMarkets.length > 0 ? activeMarkets : [activeShop]

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
      return setError('Please select at least one authorized subsection or module.')
    }

    setBusy(true)
    try {
      await api.patch(
        `/api/auth/users/${user._id}`,
        {
          marketplace: finalMarkets[0],
          marketplaces: finalMarkets,
          mainRoutes: computedMainRoutes,
          allowedSections: uniqueAllowedSections,
        },
        token,
      )
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await api.del(`/api/auth/users/${user._id}`, token)
      onDeleted()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Permissions & Access — ${user.name}`} onClose={onClose} wide>
      {confirmDelete ? (
        <div className="space-y-4 text-sm">
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-semibold">Permanently Delete Sub-Admin</p>
            <p className="mt-1 text-xs">
              Are you sure you want to permanently delete <span className="font-bold">{user.name} (@{user.username || user.email})</span>? All permissions for {theme.label} will be revoked and this account will be removed immediately.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Target Shop Designation */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Assigned Marketplace Shop
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {[
                { id: 'ebay', label: 'eBay Store' },
                { id: 'tiktok_shop', label: 'TikTok Shop' },
                { id: 'temu', label: 'Temu Shop' },
              ].map((shop) => {
                const isSelected = activeShop === shop.id
                const count = (sectionsByShop[shop.id] || []).length
                const total = (MARKETPLACE_SUBSECTIONS[shop.id] || []).length
                return (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => handleSwitchShop(shop.id)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500 dark:bg-indigo-950/40'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {shop.label}
                      </span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {count > 0 ? `${count}/${total} selected` : '0 selected'}
                      </span>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSelected ? 'bg-indigo-600 dark:bg-indigo-400' : count > 0 ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </section>

          {/* Section Permissions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Authorized Modules & Subsections
              </p>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Select all
                </button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="text-gray-500 hover:underline dark:text-gray-400"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Platform Modules */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                Platform Modules
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PLATFORM_ROUTES.map(([value, label, desc]) => {
                  const on = mainRoutes.includes(value)
                  return (
                    <div
                      key={value}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={on}
                      onClick={() => togglePlatformRoute(value)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          togglePlatformRoute(value)
                        }
                      }}
                      className={choiceCardClass(on)}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {label}
                        </span>
                        {desc && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {desc}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Shop Native Subsections */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                    {theme.shortLabel} Subsections
                  </p>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${theme.badge}`}>
                    {currentShopSections.length} of {nativeSubsections.length} enabled
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllShopSections}
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300 dark:text-gray-700">|</span>
                  <button
                    type="button"
                    onClick={clearShopSections}
                    className="text-gray-500 hover:underline dark:text-gray-400"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {nativeSubsections.map((sub) => {
                  const isSelected = currentShopSections.includes(sub.id)
                  return (
                    <div
                      key={sub.id}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelected}
                      onClick={() => toggleSection(sub.id)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          toggleSection(sub.id)
                        }
                      }}
                      className={choiceCardClass(isSelected)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {sub.label}
                        </span>
                        {sub.desc && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {sub.desc}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-slate-800">
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete Sub-Admin
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save permissions'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function SubAdminManagementPage() {
  const { token } = useAuth()
  const usersRes = useApi(token ? '/api/auth/users' : null)
  const users = Array.isArray(usersRes.data) ? usersRes.data : []

  const [search, setSearch] = useState('')
  const [shopFilter, setShopFilter] = useState('all') // 'all' | 'ebay' | 'tiktok_shop' | 'temu'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'disabled'
  const [editingAccessUser, setEditingAccessUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [successBanner, setSuccessBanner] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const handleConfirmDelete = async () => {
    if (!deletingUser) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.del(`/api/auth/users/${deletingUser._id}`, token)
      const name = deletingUser.name
      setDeletingUser(null)
      setSuccessBanner(`Sub-admin "${name}" has been permanently deleted.`)
      setTimeout(() => setSuccessBanner(''), 5000)
      await usersRes.refetch()
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete sub-admin')
    } finally {
      setDeleteBusy(false)
    }
  }

  // Status toggle handler
  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setTogglingId(user._id)
    try {
      await api.patch(`/api/auth/users/${user._id}`, { status: nextStatus }, token)
      usersRes.refetch()
    } catch (err) {
      alert(`Could not update status: ${err.message}`)
    } finally {
      setTogglingId(null)
    }
  }

  // Filter & search computation
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    return users.filter((u) => {
      if (!u) return false

      // 1. Shop filter (dedicated per-shop segregation)
      const userMarket = u.marketplace || u.marketplaces?.[0] || 'ebay'
      if (shopFilter !== 'all' && userMarket !== shopFilter) {
        return false
      }

      // 2. Status filter
      if (statusFilter !== 'all' && (u.status || 'active') !== statusFilter) {
        return false
      }

      // 3. Search query
      if (search && search.trim()) {
        const q = search.trim().toLowerCase()
        const nameMatch = u.name?.toLowerCase().includes(q)
        const usernameMatch = u.username?.toLowerCase().includes(q)
        const emailMatch = u.email?.toLowerCase().includes(q)
        if (!nameMatch && !usernameMatch && !emailMatch) return false
      }
      return true
    })
  }, [users, search, shopFilter, statusFilter])

  // Aggregate counts per shop & status
  const counts = useMemo(() => {
    if (!Array.isArray(users)) return { total: 0, active: 0, suspended: 0, ebay: 0, tiktok: 0, temu: 0 }
    let active = 0
    let suspended = 0
    let ebay = 0
    let tiktok = 0
    let temu = 0

    users.forEach((u) => {
      const isAct = (u?.status || 'active') === 'active'
      if (isAct) active += 1
      else suspended += 1

      const market = u?.marketplace || u?.marketplaces?.[0] || 'ebay'
      if (market === 'ebay') ebay += 1
      else if (market === 'tiktok_shop') tiktok += 1
      else if (market === 'temu') temu += 1
    })

    return { total: users.length, active, suspended, ebay, tiktok, temu }
  }, [users])

  if (usersRes.loading) return <Spinner />
  if (usersRes.error) return <ErrorState message={usersRes.error} onRetry={usersRes.refetch} />

  const closeAndRefresh = () => {
    setEditingAccessUser(null)
    usersRes.refetch()
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
            Administration
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Sub-admin management
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Manage employee access across your marketplace shops (eBay, TikTok Shop, Temu) in one unified dashboard.
          </p>
        </div>
        <Link to="/sub-admins/new" className="self-start sm:self-auto">
          <Button className="shadow-sm">+ Create Sub-Admin</Button>
        </Link>
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shop Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShopFilter('all')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            shopFilter === 'all'
              ? 'border-indigo-500 bg-indigo-50/60 shadow-xs dark:bg-indigo-950/30'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">All Sub-Admins</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{counts.total}</p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setShopFilter('ebay')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            shopFilter === 'ebay'
              ? 'border-blue-500 bg-blue-50/60 shadow-xs dark:bg-blue-950/30'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">eBay Admins</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{counts.ebay}</p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setShopFilter('tiktok_shop')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            shopFilter === 'tiktok_shop'
              ? 'border-rose-500 bg-rose-50/60 shadow-xs dark:bg-rose-950/30'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">TikTok Shop</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{counts.tiktok}</p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setShopFilter('temu')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            shopFilter === 'temu'
              ? 'border-amber-500 bg-amber-50/60 shadow-xs dark:bg-amber-950/30'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Temu Shop</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.temu}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search sub-admins…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Shop Segmentation Tabs */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShopFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shopFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                All Shops ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setShopFilter('ebay')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shopFilter === 'ebay'
                    ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-800 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                eBay ({counts.ebay})
              </button>
              <button
                type="button"
                onClick={() => setShopFilter('tiktok_shop')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shopFilter === 'tiktok_shop'
                    ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                TikTok ({counts.tiktok})
              </button>
              <button
                type="button"
                onClick={() => setShopFilter('temu')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shopFilter === 'temu'
                    ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Temu ({counts.temu})
              </button>
            </div>

            {/* Status tabs */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Active ({counts.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('disabled')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'disabled'
                    ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Suspended ({counts.suspended})
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Sub-Admins Grid */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          message={
            users.length === 0
              ? 'No sub-admin accounts created yet. Click "+ Create Sub-Admin" to get started.'
              : 'No sub-admins match your current shop or status filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredUsers.map((user) => {
            const userMarkets = Array.isArray(user.marketplaces) && user.marketplaces.length > 0
              ? user.marketplaces
              : [user.marketplace || 'ebay']
            const theme = SHOP_THEMES[userMarkets[0]] || SHOP_THEMES.ebay
            const isActive = (user.status || 'active') === 'active'
            const isToggling = togglingId === user._id

            const rawAllowed = Array.isArray(user.allowedSections) ? user.allowedSections : []
            const hasScoped = rawAllowed.some((x) => x.includes(':'))
            const hasExplicit = rawAllowed.length > 0

            // Group active subsections across all assigned shops
            const activeSubs = []
            userMarkets.forEach((m) => {
              const subsMeta = MARKETPLACE_SUBSECTIONS[m] || []
              let matched = []
              if (hasScoped) {
                matched = subsMeta.filter((s) => rawAllowed.includes(`${m}:${s.id}`))
              } else if (hasExplicit && userMarkets.length === 1) {
                matched = subsMeta.filter((s) => rawAllowed.includes(s.id))
              }
              matched.forEach((s) => {
                activeSubs.push({ ...s, market: m })
              })
            })

            return (
              <Card key={user._id} className="relative flex flex-col justify-between transition-all hover:shadow-md">
                <div>
                  {/* Top user row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {user.profileImageUrl ? (
                        <img
                          src={user.profileImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900/50"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-base font-bold text-white shadow-sm">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="truncate font-semibold text-gray-900 dark:text-gray-100">
                            {user.name}
                          </h2>
                          {userMarkets.map((m) => {
                            const mTheme = SHOP_THEMES[m] || SHOP_THEMES.ebay
                            return (
                              <span key={m} className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${mTheme.badge}`}>
                                {mTheme.shortLabel}
                              </span>
                            )
                          })}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {isActive ? 'Active' : 'Suspended'}
                          </span>
                        </div>
                        <p className="truncate text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                          @{user.username || user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link to={`/sub-admins/${user._id}/edit`}>
                        <Button variant="secondary" size="sm" title="Edit account details">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingAccessUser(user)}
                        title="Configure subsections"
                      >
                        Permissions
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDeleteError('')
                          setDeletingUser(user)
                        }}
                        title="Delete sub-admin account"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Subsections & Access summary */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-[11px]">
                        {userMarkets.length > 1 ? 'Assigned Subsections' : `${theme.shortLabel} Subsections`} ({activeSubs.length})
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {activeSubs.length > 0 ? (
                        activeSubs.map((sub, idx) => (
                          <AccessPill
                            key={`${sub.market || 'm'}-${sub.id}-${idx}`}
                            variant={sub.market === 'ebay' ? 'blue' : sub.market === 'tiktok_shop' ? 'rose' : 'amber'}
                          >
                            {userMarkets.length > 1 ? `${SHOP_THEMES[sub.market]?.shortLabel || ''}: ${sub.label}` : sub.label}
                          </AccessPill>
                        ))
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">No subsections assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit & Quick Toggle Footer */}
                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-slate-800 dark:text-gray-400">
                  <div className="space-y-0.5">
                    <div>
                      Created: {formatDateSafe(user.createdAt)}
                    </div>
                    <div>
                      Last active: {formatDateTimeSafe(user.lastLoginAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(user)}
                    disabled={isToggling}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold text-xs transition-colors ${
                      isActive
                        ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                        : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    {isToggling ? 'Updating…' : isActive ? 'Suspend Account' : 'Activate Account'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Permissions Modal */}
      {editingAccessUser && (
        <EditAccessModal
          user={editingAccessUser}
          token={token}
          onClose={() => setEditingAccessUser(null)}
          onSaved={closeAndRefresh}
          onDeleted={closeAndRefresh}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <Modal
          title="Delete Sub-Admin"
          onClose={() => !deleteBusy && setDeletingUser(null)}
        >
          <div className="space-y-4 text-sm">
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="font-bold text-red-950 dark:text-red-100 mb-1">
                    Permanently delete this sub-admin?
                  </h4>
                  <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold underline">{deletingUser.name}</span> (<span className="font-mono">{deletingUser.username || deletingUser.email}</span>)?
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                    All shop permissions for <span className="font-semibold">{SHOP_THEMES[deletingUser.marketplace || deletingUser.marketplaces?.[0] || 'ebay']?.label || 'Marketplace'}</span> will be permanently revoked, and this account will be removed immediately.
                  </p>
                </div>
              </div>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              >
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-slate-800">
              <Button
                variant="secondary"
                onClick={() => setDeletingUser(null)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete Sub-Admin'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
