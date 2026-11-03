import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useApi } from '../../hooks/useApi'
import { PLATFORM_ROUTES, MARKETPLACE_SUBSECTIONS } from '../../lib/access'
import { SHOP_SECTIONS } from '../../lib/shops'

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

export default function SubAdminFormPage() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const shops = Array.isArray(shopsRes.data) ? shopsRes.data : []

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('active')
  const [marketplaces, setMarketplaces] = useState([])
  const [mainRoutes, setMainRoutes] = useState([])
  const [allowedSections, setAllowedSections] = useState([])
  const [activeShopTab, setActiveShopTab] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (existing) {
      setName(existing.name || '')
      setUsername(existing.username || existing.email || '')
      setPassword('')
      setStatus(existing.status || 'active')
      const userMarkets = Array.isArray(existing.marketplaces) ? existing.marketplaces : []
      setMarketplaces(userMarkets)
      if (userMarkets.length > 0) {
        setActiveShopTab(userMarkets[0])
      }

      const userMainRoutes = Array.isArray(existing.mainRoutes) ? existing.mainRoutes : []
      setMainRoutes(userMainRoutes)

      if (Array.isArray(existing.allowedSections) && existing.allowedSections.length > 0) {
        setAllowedSections(existing.allowedSections)
      } else {
        // Pre-populate allowed sections based on existing user mainRoutes for their assigned shops
        const initialSubs = []
        userMarkets.forEach((m) => {
          const subs = MARKETPLACE_SUBSECTIONS[m] || []
          subs.forEach((s) => {
            if (userMainRoutes.includes(s.route) && !initialSubs.includes(s.id)) {
              initialSubs.push(s.id)
            }
          })
        })
        setAllowedSections(initialSubs)
      }
    }
  }, [existing])

  // Ensure active shop tab stays in sync with assigned marketplaces
  useEffect(() => {
    if (!marketplaces.length) {
      setActiveShopTab('')
    } else if (!activeShopTab || (activeShopTab !== 'all' && !marketplaces.includes(activeShopTab))) {
      setActiveShopTab(marketplaces[0])
    }
  }, [marketplaces, activeShopTab])

  const toggleMarketplace = (marketplace) => {
    setMarketplaces((prev) => {
      const exists = prev.includes(marketplace)
      const next = exists ? prev.filter((m) => m !== marketplace) : [...prev, marketplace]
      if (!exists) {
        // When newly adding a marketplace, pre-select its subsections for a frictionless setup
        const newSubs = (MARKETPLACE_SUBSECTIONS[marketplace] || []).map((s) => s.id)
        setAllowedSections((curr) => [...new Set([...curr, ...newSubs])])
        setActiveShopTab(marketplace)
      } else {
        if (activeShopTab === marketplace) {
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

  const save = async (event) => {
    event.preventDefault()
    setError('')

    const trimmedName = name.trim()
    const trimmedUsername = username.trim()

    if (!trimmedName || !trimmedUsername) {
      return setError('Name and username are required.')
    }
    if (!editing && !password) {
      return setError('Password is required for new sub-admins.')
    }
    if (!marketplaces.length) {
      return setError('Please assign at least one marketplace shop.')
    }

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
      const body = {
        name: trimmedName,
        username: trimmedUsername,
        status,
        marketplaces,
        mainRoutes: computedMainRoutes,
        allowedSections,
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

  if (editing && usersRes.loading) return <Spinner />
  if (editing && (usersRes.error || !existing)) return <ErrorState message={usersRes.error || 'Sub-admin not found'} />

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Header Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          to="/sub-admins"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:underline"
        >
          ← Sub-admins
        </Link>
        <span className="text-gray-300 dark:text-gray-700">/</span>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {editing ? 'Edit sub-admin account & access' : 'Create new sub-admin'}
        </h1>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Card 1: Account Credentials */}
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Account Credentials</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Login identity and account activation state.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                required
              />
              <Input
                label="Username / Email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sjenkins"
                autoComplete="off"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label={editing ? 'Password (leave blank to keep current)' : 'Password'}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? '••••••••' : 'Min 6 characters'}
                autoComplete="new-password"
                required={!editing}
              />

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Account Status
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStatus('active')}
                    className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                      status === 'active'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active (Allowed login)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('disabled')}
                    className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                      status === 'disabled'
                        ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:border-rose-600 dark:text-rose-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Suspended (Blocked)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Assigned Marketplace Stores */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Assigned Marketplace Shops</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select which marketplace store sections this sub-admin can access.
                </p>
              </div>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SHOP_SECTIONS.map((section) => {
                const connectedShop = shops.find((s) => s.marketplace === section.marketplace && s.status === 'connected')
                const isConfigured = shops.some((s) => s.marketplace === section.marketplace)
                const isSelected = marketplaces.includes(section.marketplace)

                return (
                  <div
                    key={section.id}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={isSelected}
                    onClick={() => toggleMarketplace(section.marketplace)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        toggleMarketplace(section.marketplace)
                      }
                    }}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/80 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block font-semibold text-gray-900 dark:text-gray-100">
                          {section.label}
                        </span>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              connectedShop ? 'bg-emerald-500' : isConfigured ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                          <span className="truncate">
                            {connectedShop ? (connectedShop.name || 'Connected') : isConfigured ? 'Configured' : 'Not connected'}
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent container
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Card 3: Dynamic Section Permissions */}
        <Card>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Section Permissions</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Granular control over which dashboard pages and shop subsections this sub-admin can open.
                </p>
              </div>
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

            {/* Platform-Wide Modules */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Platform-Wide Modules
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {PLATFORM_ROUTES.map(([key, label, desc]) => {
                  const isSelected = mainRoutes.includes(key)
                  return (
                    <div
                      key={key}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelected}
                      onClick={() => togglePlatformRoute(key)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          togglePlatformRoute(key)
                        }
                      }}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/30'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {label}
                        </span>
                        {desc && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {desc}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Dynamic Shop Management Subsections */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Shop Management Subsections
                  </p>
                  {marketplaces.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
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
                      Select {activeShopTab === 'all' ? 'all shop' : MARKET_META[activeShopTab]?.label || 'shop'} subsections
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
                <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center dark:border-slate-700">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    No marketplace shops assigned yet.
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Select eBay, TikTok Shop, or Temu Shop above to configure its native subsections.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Shop Tabs if multiple marketplaces are assigned */}
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
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          activeShopTab === 'all'
                            ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400'
                            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                      >
                        <span>All Assigned Shops</span>
                      </button>
                    </div>
                  )}

                  {/* Render Subsections for Single Shop or Selected Tab */}
                  {(activeShopTab === 'all' ? marketplaces : [activeShopTab]).filter(Boolean).map((marketKey) => {
                    const meta = MARKET_META[marketKey] || { label: marketKey, badge: '' }
                    const subs = MARKETPLACE_SUBSECTIONS[marketKey] || []

                    return (
                      <div key={marketKey} className="space-y-2">
                        {activeShopTab === 'all' && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({subs.length} native subsections)
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                  isSelected
                                    ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/30'
                                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  tabIndex={-1}
                                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                      {sub.label}
                                    </span>
                                    {activeShopTab === 'all' && (
                                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-semibold border ${meta.badge}`}>
                                        {meta.label}
                                      </span>
                                    )}
                                  </div>
                                  {sub.desc && (
                                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
          </div>
        </Card>

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/sub-admins">
            <Button type="button" variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Sub-admin'}
          </Button>
        </div>
      </form>
    </div>
  )
}
