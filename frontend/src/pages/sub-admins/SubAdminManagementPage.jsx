import { useState, useMemo, useEffect } from 'react'
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

const MARKET_META = {
  ebay: {
    label: 'eBay',
    badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  },
  tiktok_shop: {
    label: 'TikTok Shop',
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  },
  temu: {
    label: 'Temu Shop',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
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

function EditAccessModal({ user, shops, token, onClose, onSaved, onDeleted }) {
  const [marketplaces, setMarketplaces] = useState(() => (Array.isArray(user?.marketplaces) ? user.marketplaces : []))
  const [mainRoutes, setMainRoutes] = useState(() => (Array.isArray(user?.mainRoutes) ? user.mainRoutes : []))
  const [allowedSections, setAllowedSections] = useState(() => {
    if (Array.isArray(user?.allowedSections) && user.allowedSections.length > 0) {
      return user.allowedSections
    }
    const initialSubs = []
    const userMarkets = Array.isArray(user?.marketplaces) ? user.marketplaces : []
    const userMainRoutes = Array.isArray(user?.mainRoutes) ? user.mainRoutes : []
    userMarkets.forEach((m) => {
      const subs = MARKETPLACE_SUBSECTIONS[m] || []
      subs.forEach((s) => {
        if (userMainRoutes.includes(s.route) && !initialSubs.includes(s.id)) {
          initialSubs.push(s.id)
        }
      })
    })
    return initialSubs
  })
  const [activeShopTab, setActiveShopTab] = useState(() => (Array.isArray(user?.marketplaces) && user.marketplaces[0]) || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!marketplaces.length) {
      setActiveShopTab('')
    } else if (!activeShopTab || (activeShopTab !== 'all' && !marketplaces.includes(activeShopTab))) {
      setActiveShopTab(marketplaces[0])
    }
  }, [marketplaces, activeShopTab])

  const toggleMarketplace = (market) => {
    setMarketplaces((prev) => {
      const exists = prev.includes(market)
      const next = exists ? prev.filter((m) => m !== market) : [...prev, market]
      if (!exists) {
        // Pre-select new marketplace subsections
        const newSubs = (MARKETPLACE_SUBSECTIONS[market] || []).map((s) => s.id)
        setAllowedSections((curr) => [...new Set([...curr, ...newSubs])])
        setActiveShopTab(market)
      } else {
        if (activeShopTab === market) {
          setActiveShopTab(next[0] || '')
        }
      }
      return next
    })
  }

  const selectAllShops = () => {
    const all = SHOP_SECTIONS.map((s) => s.marketplace)
    setMarketplaces(all)
    const allSubs = Object.values(MARKETPLACE_SUBSECTIONS).flatMap((list) => list.map((s) => s.id))
    setAllowedSections((curr) => [...new Set([...curr, ...allSubs])])
    if (!activeShopTab || !all.includes(activeShopTab)) {
      setActiveShopTab(all[0] || '')
    }
  }

  const clearShops = () => {
    setMarketplaces([])
    setAllowedSections([])
    setActiveShopTab('')
  }

  const togglePlatformRoute = (key) => {
    setMainRoutes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const toggleSection = (sectionId) => {
    setAllowedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    )
  }

  const selectAllPermissions = () => {
    setMainRoutes(PLATFORM_ROUTES.map(([k]) => k))
    const currentSubs = marketplaces.flatMap((m) => (MARKETPLACE_SUBSECTIONS[m] || []).map((s) => s.id))
    setAllowedSections([...new Set(currentSubs)])
  }

  const clearAllPermissions = () => {
    setMainRoutes([])
    setAllowedSections([])
  }

  const selectAllTabSections = (tabMarket) => {
    const targetMarkets = tabMarket === 'all' ? marketplaces : [tabMarket]
    const targetSubs = targetMarkets.flatMap((m) => (MARKETPLACE_SUBSECTIONS[m] || []).map((s) => s.id))
    setAllowedSections((curr) => [...new Set([...curr, ...targetSubs])])
  }

  const clearTabSections = (tabMarket) => {
    const targetMarkets = tabMarket === 'all' ? marketplaces : [tabMarket]
    const targetSubs = new Set(targetMarkets.flatMap((m) => (MARKETPLACE_SUBSECTIONS[m] || []).map((s) => s.id)))
    setAllowedSections((curr) => curr.filter((id) => !targetSubs.has(id)))
  }

  const save = async () => {
    setError('')
    if (!marketplaces.length) return setError('Please select at least one marketplace shop.')

    // Derive mainRoutes from platform routes + allowed shop subsections
    const platformSelected = mainRoutes.filter((r) => PLATFORM_ROUTES.some(([k]) => k === r))
    const shopRoutesSelected = []
    marketplaces.forEach((m) => {
      const subs = MARKETPLACE_SUBSECTIONS[m] || []
      subs.forEach((s) => {
        if (allowedSections.includes(s.id) && !shopRoutesSelected.includes(s.route)) {
          shopRoutesSelected.push(s.route)
        }
      })
    })
    const computedMainRoutes = [...new Set([...platformSelected, ...shopRoutesSelected])]

    if (!computedMainRoutes.length && !allowedSections.length) {
      return setError('Please select at least one authorized section or module.')
    }

    setBusy(true)
    try {
      await api.patch(
        `/api/auth/users/${user._id}`,
        { marketplaces, mainRoutes: computedMainRoutes, allowedSections },
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
            <p className="font-semibold">Confirm Deactivation</p>
            <p className="mt-1 text-xs">
              Deactivate <span className="font-bold">{user.name} (@{user.username || user.email})</span>? The account will be immediately blocked from logging in. Historical order and audit logs are preserved.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? 'Deactivating…' : 'Confirm Deactivation'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Marketplace Stores Section */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Assigned Marketplace Shops
              </p>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllShops}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Select all
                </button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button
                  type="button"
                  onClick={clearShops}
                  className="text-gray-500 hover:underline dark:text-gray-400"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {SHOP_SECTIONS.map((section) => {
                const connectedShop = shops.find((s) => s.marketplace === section.marketplace && s.status === 'connected')
                const on = marketplaces.includes(section.marketplace)
                return (
                  <div
                    key={section.id}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={on}
                    onClick={() => toggleMarketplace(section.marketplace)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        toggleMarketplace(section.marketplace)
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
                        {section.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            connectedShop ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                        <span className="truncate">
                          {connectedShop ? (connectedShop.name || 'Connected') : 'Not connected'}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Section Permissions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Authorized Sections & Subsections
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

            {/* Dynamic Shop Subsections */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                    Shop Management Subsections
                  </p>
                  {marketplaces.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {allowedSections.length} selected
                    </span>
                  )}
                </div>

                {marketplaces.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => selectAllTabSections(activeShopTab)}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Select {activeShopTab === 'all' ? 'all' : MARKET_META[activeShopTab]?.label || 'shop'}
                    </button>
                    <span className="text-gray-300 dark:text-gray-700">|</span>
                    <button
                      type="button"
                      onClick={() => clearTabSections(activeShopTab)}
                      className="text-gray-500 hover:underline dark:text-gray-400"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {marketplaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center dark:border-slate-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No marketplace shops assigned. Select a shop above to configure subsections.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Shop Tabs if multiple marketplaces */}
                  {marketplaces.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
                      {marketplaces.map((m) => {
                        const meta = MARKET_META[m] || { label: m }
                        const count = (MARKETPLACE_SUBSECTIONS[m] || []).length
                        const isTabActive = activeShopTab === m
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setActiveShopTab(m)}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                              isTabActive
                                ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
                          >
                            <span>{meta.label}</span>
                            <span className="rounded-full bg-gray-200/70 px-1.5 py-0.2 text-[10px] text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                              {count}
                            </span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => setActiveShopTab('all')}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                          activeShopTab === 'all'
                            ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400'
                            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                      >
                        <span>All Assigned</span>
                      </button>
                    </div>
                  )}

                  {/* Render Subsections */}
                  {(activeShopTab === 'all' ? marketplaces : [activeShopTab]).filter(Boolean).map((marketKey) => {
                    const meta = MARKET_META[marketKey] || { label: marketKey, badge: '' }
                    const subs = MARKETPLACE_SUBSECTIONS[marketKey] || []

                    return (
                      <div key={marketKey} className="space-y-1.5">
                        {activeShopTab === 'all' && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {subs.map((sub) => {
                            const isSelected = allowedSections.includes(sub.id)
                            return (
                              <div
                                key={`${marketKey}-${sub.id}`}
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
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                      {sub.label}
                                    </span>
                                    {activeShopTab === 'all' && (
                                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-semibold border ${meta.badge}`}>
                                        {meta.label}
                                      </span>
                                    )}
                                  </div>
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
                    )
                  })}
                </div>
              )}
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
              Deactivate account
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
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = Array.isArray(shopsRes.data) ? shopsRes.data : []
  const users = Array.isArray(usersRes.data) ? usersRes.data : []

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'disabled'
  const [marketFilter, setMarketFilter] = useState('all') // 'all' | 'ebay' | 'tiktok_shop' | 'temu'
  const [editingAccessUser, setEditingAccessUser] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

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
      // 1. Status filter
      if (statusFilter !== 'all' && (u.status || 'active') !== statusFilter) {
        return false
      }
      // 2. Marketplace filter
      if (marketFilter !== 'all' && !(u.marketplaces || []).includes(marketFilter)) {
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
  }, [users, search, statusFilter, marketFilter])

  const counts = useMemo(() => {
    if (!Array.isArray(users)) return { total: 0, active: 0, suspended: 0 }
    const total = users.length
    const active = users.filter((u) => (u?.status || 'active') === 'active').length
    const suspended = users.filter((u) => u?.status === 'disabled').length
    return { total, active, suspended }
  }, [users])

  if (usersRes.loading || shopsRes.loading) return <Spinner />
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
            Manage employee access, assign marketplace shops (eBay, TikTok Shop, Temu), and set granular subsection permissions.
          </p>
        </div>
        <Link to="/sub-admins/new" className="self-start sm:self-auto">
          <Button className="shadow-sm">Create sub-admin</Button>
        </Link>
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
            {/* Status tabs */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                All ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Active ({counts.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('disabled')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === 'disabled'
                    ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Suspended ({counts.suspended})
              </button>
            </div>

            {/* Marketplace filter select */}
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-gray-300"
            >
              <option value="all">All Marketplaces</option>
              <option value="ebay">eBay Only</option>
              <option value="tiktok_shop">TikTok Shop Only</option>
              <option value="temu">Temu Shop Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main List */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          message={
            users.length === 0
              ? 'No sub-admin accounts created yet.'
              : 'No sub-admins match your search or filter criteria.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredUsers.map((user) => {
            const assignedShops = (user.marketplaces || [])
              .map((marketplace) => shopSectionFromMarketplace(marketplace))
              .filter(Boolean)
            const isActive = (user.status || 'active') === 'active'
            const isToggling = togglingId === user._id

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
                        <div className="flex items-center gap-2">
                          <h2 className="truncate font-semibold text-gray-900 dark:text-gray-100">
                            {user.name}
                          </h2>
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

                    <div className="flex items-center gap-1.5">
                      <Link to={`/sub-admins/${user._id}/edit`}>
                        <Button variant="secondary" size="sm" title="Edit account & password">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingAccessUser(user)}
                        title="Quickly edit permissions"
                      >
                        Permissions
                      </Button>
                    </div>
                  </div>

                  {/* Badges section */}
                  <div className="mt-4 space-y-3.5 text-xs">
                    {/* Assigned Shops */}
                    <div>
                      <p className="mb-1.5 font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-[11px]">
                        Assigned Marketplace Shops
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {assignedShops.length ? (
                          assignedShops.map((shop) => {
                            const isConn = shops.some((s) => s.marketplace === shop.marketplace && s.status === 'connected')
                            return (
                              <AccessPill key={shop.id} variant={isConn ? 'emerald' : 'indigo'}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isConn ? 'bg-emerald-500' : 'bg-indigo-400'}`} />
                                {shop.label}
                              </AccessPill>
                            )
                          })
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 italic">None assigned</span>
                        )}
                      </div>
                    </div>

                    {/* Authorized Subsections & Sections */}
                    <div>
                      <p className="mb-1.5 font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-[11px]">
                        Authorized Subsections ({user.allowedSections?.length || user.mainRoutes?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {user.allowedSections?.length ? (
                          user.allowedSections.map((secId) => (
                            <AccessPill key={secId} variant="indigo">
                              {SUBSECTION_LABELS[secId] || ROUTE_LABELS[secId] || secId}
                            </AccessPill>
                          ))
                        ) : user.mainRoutes?.length ? (
                          user.mainRoutes.map((route) => (
                            <AccessPill key={route} variant="indigo">
                              {ROUTE_LABELS[route] || route}
                            </AccessPill>
                          ))
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 italic">None assigned</span>
                        )}
                      </div>
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
          shops={shops}
          token={token}
          onClose={() => setEditingAccessUser(null)}
          onSaved={closeAndRefresh}
          onDeleted={closeAndRefresh}
        />
      )}
    </div>
  )
}
