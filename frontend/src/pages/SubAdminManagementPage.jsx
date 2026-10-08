import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback'
import { useApi } from '../hooks/useApi'

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  products: 'Products',
  inventory: 'Inventory',
  orders: 'Orders',
  customers: 'Customers',
  inbox: 'Inbox',
}

function AccessPill({ children }) {
  return <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{children}</span>
}

export default function SubAdminManagementPage() {
  const { token } = useAuth()
  const usersRes = useApi(token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const shopMap = new Map(shops.map((shop) => [shop._id, shop]))
  const users = usersRes.data || []

  if (usersRes.loading || shopsRes.loading) return <Spinner />
  if (usersRes.error) return <ErrorState message={usersRes.error} onRetry={usersRes.refetch} />

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
                  <Link to={`/sub-admins/${user._id}/edit`}><Button variant="secondary" size="sm">Edit</Button></Link>
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
    </div>
  )
}
