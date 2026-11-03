import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'
import { useApi } from '../../hooks/useApi'
import { PLATFORM_ROUTES, MARKETPLACE_SUBSECTIONS } from '../../lib/access'
import { SHOP_SECTIONS } from '../../lib/shops'

const SHOPS = [
  {
    id: 'ebay',
    marketplace: 'ebay',
    label: 'eBay Sub-Admin',
    shopName: 'eBay Store',
    desc: 'Manage listings, buyer offers, orders, disputes, cases, payouts & messaging.',
    theme: {
      border: 'border-blue-500',
      bgActive: 'bg-blue-50/80 dark:bg-blue-950/30',
      badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      indicator: 'bg-blue-500',
    },
  },
  {
    id: 'tiktok_shop',
    marketplace: 'tiktok_shop',
    label: 'TikTok Shop Sub-Admin',
    shopName: 'TikTok Shop (Scentro)',
    desc: 'Manage live products, package fulfillment, creator affiliates, video analytics & finance.',
    theme: {
      border: 'border-rose-500',
      bgActive: 'bg-rose-50/80 dark:bg-rose-950/30',
      badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
      indicator: 'bg-rose-500',
    },
  },
  {
    id: 'temu',
    marketplace: 'temu',
    label: 'Temu Shop Sub-Admin',
    shopName: 'Temu Store',
    desc: 'Manage seller goods, inventory, warehouse shipping, price reviews & return claims.',
    theme: {
      border: 'border-amber-500',
      bgActive: 'bg-amber-50/80 dark:bg-amber-950/30',
      badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      indicator: 'bg-amber-500',
    },
  },
]

export default function SubAdminFormPage() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const connectedShops = Array.isArray(shopsRes.data) ? shopsRes.data : []

  const [marketplace, setMarketplace] = useState('ebay')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('active')
  const [mainRoutes, setMainRoutes] = useState([])
  const [allowedSections, setAllowedSections] = useState([])
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

  // Selected shop config & native subsections
  const selectedShop = SHOPS.find((s) => s.marketplace === marketplace) || SHOPS[0]
  const nativeSubsections = MARKETPLACE_SUBSECTIONS[marketplace] || []

  // Initialize or reset form when existing data loads
  useEffect(() => {
    if (existing) {
      setName(existing.name || '')
      setUsername(existing.username || existing.email || '')
      setPassword('')
      setStatus(existing.status || 'active')

      const userMarket = existing.marketplace || existing.marketplaces?.[0] || 'ebay'
      setMarketplace(userMarket)

      const userMainRoutes = Array.isArray(existing.mainRoutes) ? existing.mainRoutes : []
      setMainRoutes(userMainRoutes)

      if (Array.isArray(existing.allowedSections) && existing.allowedSections.length > 0) {
        setAllowedSections(existing.allowedSections)
      } else {
        // Pre-populate native subsections derived from userMainRoutes
        const subs = MARKETPLACE_SUBSECTIONS[userMarket] || []
        const initial = subs.filter((s) => userMainRoutes.includes(s.route)).map((s) => s.id)
        setAllowedSections(initial.length > 0 ? initial : subs.map((s) => s.id))
      }
    } else {
      // Default: new sub-admin has all native subsections of the active shop pre-selected
      const subs = MARKETPLACE_SUBSECTIONS['ebay'] || []
      setAllowedSections(subs.map((s) => s.id))
    }
  }, [existing])

  // Handle switching target shop
  const handleSelectShop = (marketId) => {
    setMarketplace(marketId)
    // Pre-select all native subsections of the new shop for convenience
    const subs = MARKETPLACE_SUBSECTIONS[marketId] || []
    setAllowedSections(subs.map((s) => s.id))
  }

  const togglePlatformRoute = (key) => {
    setMainRoutes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const toggleSection = (sectionId) => {
    setAllowedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    )
  }

  const selectAllShopSections = () => {
    setAllowedSections(nativeSubsections.map((s) => s.id))
  }

  const clearShopSections = () => {
    setAllowedSections([])
  }

  const selectAllPermissions = () => {
    setMainRoutes(PLATFORM_ROUTES.map(([k]) => k))
    setAllowedSections(nativeSubsections.map((s) => s.id))
  }

  const clearAllPermissions = () => {
    setMainRoutes([])
    setAllowedSections([])
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

    // Derive mainRoutes: platform routes + parent routes of all selected subsections
    const platformSelected = mainRoutes.filter((r) => PLATFORM_ROUTES.some(([k]) => k === r))
    const shopRoutesSelected = []
    nativeSubsections.forEach((s) => {
      if (allowedSections.includes(s.id) && !shopRoutesSelected.includes(s.route)) {
        shopRoutesSelected.push(s.route)
      }
    })
    const computedMainRoutes = [...new Set([...platformSelected, ...shopRoutesSelected])]

    if (!computedMainRoutes.length && !allowedSections.length) {
      return setError('Please select at least one authorized subsection or platform module.')
    }

    setBusy(true)
    try {
      const body = {
        name: trimmedName,
        username: trimmedUsername,
        email: trimmedUsername,
        status,
        marketplace,
        marketplaces: [marketplace],
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
          {editing ? `Edit ${selectedShop.label}` : `Create ${selectedShop.label}`}
        </h1>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Step 1: Target Marketplace Shop Selection */}
        <Card>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Step 1
              </p>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Target Marketplace Shop
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select which store this sub-admin is assigned to manage. The permissions below will adapt exclusively to this shop.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SHOPS.map((shop) => {
                const isSelected = marketplace === shop.marketplace
                const conn = connectedShops.find((s) => s.marketplace === shop.marketplace && s.status === 'connected')

                return (
                  <div
                    key={shop.id}
                    role="radio"
                    tabIndex={0}
                    aria-checked={isSelected}
                    onClick={() => handleSelectShop(shop.marketplace)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        handleSelectShop(shop.marketplace)
                      }
                    }}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? `${shop.theme.border} ${shop.theme.bgActive} shadow-sm ring-1 ${shop.theme.border}`
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {shop.label}
                        </span>
                        <input
                          type="radio"
                          name="marketplace_shop"
                          checked={isSelected}
                          onChange={() => {}}
                          tabIndex={-1}
                          className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        {shop.desc}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          conn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      />
                      <span className="truncate">
                        {conn ? (conn.name || 'Store Connected') : 'Not Connected'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Step 2: Account Credentials */}
        <Card>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Step 2
              </p>
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
                placeholder="e.g. sarah.jenkins@company.com or sjenkins"
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

        {/* Step 3: Scoped Section Permissions */}
        <Card>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Step 3
                </p>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {selectedShop.shopName} Permissions
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Granular control over which {selectedShop.shopName} pages and platform modules this sub-admin can open.
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

            {/* Shop Native Subsections */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {selectedShop.shopName} Subsections
                  </p>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${selectedShop.theme.badge}`}>
                    {allowedSections.length} of {nativeSubsections.length} enabled
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllShopSections}
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Select all shop sections
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

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {nativeSubsections.map((sub) => {
                  const isSelected = allowedSections.includes(sub.id)
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
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isSelected
                          ? `${selectedShop.theme.border} ${selectedShop.theme.bgActive} shadow-xs`
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
                          {sub.label}
                        </span>
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
        <div className="flex items-center justify-between gap-3 pt-2">
          {editing ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setDeleteError('')
                setShowDeleteModal(true)
              }}
              disabled={busy || deleteBusy}
            >
              Delete Sub-Admin
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Link to="/sub-admins">
              <Button type="button" variant="secondary" disabled={busy || deleteBusy}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={busy || deleteBusy}>
              {busy ? 'Saving…' : editing ? 'Save Changes' : `Create ${selectedShop.label}`}
            </Button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Sub-Admin"
          onClose={() => !deleteBusy && setShowDeleteModal(false)}
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
                    Are you sure you want to delete <span className="font-bold underline">{name}</span> (<span className="font-mono">{username}</span>)?
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                    All shop permissions for <span className="font-semibold">{selectedShop.label}</span> will be permanently revoked and their account removed immediately.
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
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
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
