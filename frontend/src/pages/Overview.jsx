import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Card, { StatCard } from '../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback'
import { useApi } from '../hooks/useApi'

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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <StatCard label={c.label} value={c.value} />
          </Link>
        ))}
      </div>
      <Card>
        <h2 className="font-semibold">Marketplace integrations</h2>
        <p className="mt-1 text-sm text-gray-600">
          eBay, Temu and TikTok Shop APIs are not connected yet. Shops below are staged records —
          syncing, order pulls and listing pushes are local-only until §2.1 is implemented.
        </p>
      </Card>
    </div>
  )
}
