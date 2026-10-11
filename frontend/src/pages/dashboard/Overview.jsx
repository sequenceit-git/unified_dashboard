import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Card, { StatCard } from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'

export default function Overview() {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(token ? '/api/dashboard/overview' : null)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return <EmptyState />

  const cards = [
    { label: 'Orders', value: data.counts.orders, to: '/orders' },
    { label: 'Products', value: data.counts.products, to: '/products' },
    { label: 'Customers', value: data.counts.customers, to: '/customers' },
    { label: 'Open conversations', value: data.counts.conversations, to: '/customers' },
    { label: 'Shops', value: data.counts.shops, to: '/products' },
    { label: 'Low-stock alerts', value: data.counts.notifications, to: '/inventory' },
  ]

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Workspace overview</p>
        <h1 className="page-heading mt-1 text-3xl font-bold text-gray-900">Good morning, here’s your pulse.</h1>
        <p className="mt-2 text-sm text-gray-500">Track your stores, orders, and customer activity from one place.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <StatCard label={c.label} value={c.value} />
          </Link>
        ))}
      </div>
      <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-100 text-sm text-indigo-700">✦</span>
          <div>
            <h2 className="font-semibold text-gray-900">Marketplace integrations</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
          eBay, Temu and TikTok Shop APIs are not connected yet. Shops below are staged records —
          syncing, order pulls and listing pushes are local-only until §2.1 is implemented.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
