import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  'market-research': 'Product Discover 2',
  products: 'Products',
  inventory: 'Inventory',
  orders: 'Orders',
  customers: 'Customers',
  inbox: 'Inbox',
}

function AccessPill({ children }) {
  return <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{children}</span>
}

function EditAccessModal({ user, shops, token, onClose, onSaved, onDeleted }) {
  const [shopIds, setShopIds] = useState(() => (user.shopIds || []).map(String))
  const [mainRoutes, setMainRoutes] = useState(() => user.mainRoutes || [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const shopGroups = shops.reduce((groups, shop) => {
    const key = shop.marketplace
    if (!groups[key]) groups[key] = []
    groups[key].push(shop)
    return groups
  }, {})

  const toggle = (list, setList, value) => setList(
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
  )

  const save = async () => {
    setError('')
    if (!shopIds.length) return setError('Select at least one marketplace shop.')
    if (!mainRoutes.length) return setError('Select at least one main route.')
    setBusy(true)
    try {
      await api.patch(`/api/auth/users/${user._id}`, { shopIds, mainRoutes }, token)
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
    <Modal title={`Edit access — ${user.name}`} onClose={onClose} wide>
      {confirmDelete ? (
        <div className="space-y-4 text-sm">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            Delete <span className="font-semibold">{user.name} ({user.email})</span>? The account
            will be deactivated immediately and will no longer be able to log in. Its record is
            kept for audit history.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>Back</Button>
            <Button variant="danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Confirm delete'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Marketplace access</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(shopGroups).map(([marketplace, marketplaceShops]) => marketplaceShops.map((shop) => (
                <label key={shop._id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${shopIds.includes(String(shop._id)) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={shopIds.includes(String(shop._id))} onChange={() => toggle(shopIds, setShopIds, String(shop._id))} />
                  <span><span className="block text-sm font-semibold">{shop.name}</span><span className="text-xs text-gray-500">{marketplace}</span></span>
                </label>
              )))}
            </div>
          </section>
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Main route access</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ROUTE_LABELS).map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${mainRoutes.includes(value) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={mainRoutes.includes(value)} onChange={() => toggle(mainRoutes, setMainRoutes, value)} />
                  <span className="text-sm font-semibold">{label}</span>
                </label>
              ))}
            </div>
          </section>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save access'}</Button>
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
  const shops = shopsRes.data || []
  const shopMap = new Map(shops.map((shop) => [String(shop._id), shop]))
  const users = usersRes.data || []
  const [editing, setEditing] = useState(null)

  if (usersRes.loading || shopsRes.loading) return <Spinner />
  if (usersRes.error) return <ErrorState message={usersRes.error} onRetry={usersRes.refetch} />

  const closeAndRefresh = () => {
    setEditing(null)
    usersRes.refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold">Sub-admin management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage marketplace and main route access for your team.</p>
        </div>
        <Link to="/sub-admins/new"><Button>Create sub-admin</Button></Link>
      </div>

      {users.length === 0 ? <EmptyState message="No sub-admin accounts yet." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {users.map((user) => {
            const assignedShops = (user.shopIds || []).map((id) => shopMap.get(String(id))).filter(Boolean)
            return (
              <Card key={user._id} className="app-card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {user.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
                        {user.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-gray-900">{user.name}</h2>
                      <p className="truncate text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(user)}>Edit</Button>
                </div>
                <div className="mt-5 space-y-4 text-sm">
                  <section>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Marketplace access</p>
                    <div className="flex flex-wrap gap-2">
                      {assignedShops.length ? assignedShops.map((shop) => <AccessPill key={shop._id}>{shop.name} · {shop.marketplace}</AccessPill>) : <span className="text-gray-400">None assigned</span>}
                    </div>
                  </section>
                  <section>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Main route access</p>
                    <div className="flex flex-wrap gap-2">
                      {user.mainRoutes?.length ? user.mainRoutes.map((route) => <AccessPill key={route}>{ROUTE_LABELS[route] || route}</AccessPill>) : <span className="text-gray-400">None assigned</span>}
                    </div>
                  </section>
                </div>
                <div className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  Status: <span className={user.status === 'active' ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{user.status}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <EditAccessModal
          user={editing}
          shops={shops}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={closeAndRefresh}
          onDeleted={closeAndRefresh}
        />
      )}
    </div>
  )
}
