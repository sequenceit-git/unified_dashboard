import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useApi } from '../../hooks/useApi'
import { PLATFORM_ROUTES, SHOP_ROUTES } from '../../lib/access'
import { SHOP_SECTIONS } from '../../lib/shops'

const ALL_ROUTES = [...PLATFORM_ROUTES.map(([k]) => k), ...SHOP_ROUTES.map(([k]) => k)]

export default function SubAdminFormPage() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const shops = shopsRes.data || []

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('active')
  const [marketplaces, setMarketplaces] = useState([])
  const [mainRoutes, setMainRoutes] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (existing) {
      setName(existing.name || '')
      setUsername(existing.username || existing.email || '')
      setPassword('')
      setStatus(existing.status || 'active')
      setMarketplaces(Array.isArray(existing.marketplaces) ? existing.marketplaces : [])
      setMainRoutes(Array.isArray(existing.mainRoutes) ? existing.mainRoutes : [])
    }
  }, [existing])

  const toggleItem = (list, setList, item) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item])
  }

  const selectAllShops = () => setMarketplaces(SHOP_SECTIONS.map((s) => s.marketplace))
  const clearShops = () => setMarketplaces([])

  const selectAllRoutes = () => setMainRoutes([...ALL_ROUTES])
  const clearRoutes = () => setMainRoutes([])

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
    if (!mainRoutes.length) {
      return setError('Please select at least one authorized section.')
    }

    setBusy(true)
    try {
      const body = {
        name: trimmedName,
        username: trimmedUsername,
        status,
        marketplaces,
        mainRoutes,
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
                    onClick={() => toggleItem(marketplaces, setMarketplaces, section.marketplace)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        toggleItem(marketplaces, setMarketplaces, section.marketplace)
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

        {/* Card 3: Authorized Dashboard Sections */}
        <Card>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Section Permissions</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Granular control over which dashboard pages this sub-admin can open.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllRoutes}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Select all
                </button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button
                  type="button"
                  onClick={clearRoutes}
                  className="text-gray-500 hover:underline dark:text-gray-400"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Platform Sections */}
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
                      onClick={() => toggleItem(mainRoutes, setMainRoutes, key)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          toggleItem(mainRoutes, setMainRoutes, key)
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

            {/* Shop Sections */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Shop Management Modules
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SHOP_ROUTES.map(([key, label, desc]) => {
                  const isSelected = mainRoutes.includes(key)
                  return (
                    <div
                      key={key}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelected}
                      onClick={() => toggleItem(mainRoutes, setMainRoutes, key)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          toggleItem(mainRoutes, setMainRoutes, key)
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
