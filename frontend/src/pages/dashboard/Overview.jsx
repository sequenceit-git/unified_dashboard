import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { StatCard } from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'

export default function Overview() {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(token ? '/api/dashboard/overview' : null)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return <EmptyState />

  const unified = data.unified || {}
  const revenue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(unified.revenue || 0)
  const cards = [
    { label: 'Shops connected', value: `${unified.connected ?? 0} / 3`, sub: 'eBay, TikTok Shop, and Temu' },
    { label: 'Combined revenue', value: revenue, sub: 'Last 30 days across all shops' },
    { label: 'Ready to ship', value: unified.readyToShip ?? 0, sub: 'Paid or processing on any shop' },
    { label: 'Live listings', value: unified.liveListings ?? 0, sub: 'Active on any marketplace' },
  ]

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Workspace overview</p>
        <h1 className="page-heading mt-1 text-3xl font-bold text-gray-900">Good morning, here’s your pulse.</h1>
        <p className="mt-2 text-sm text-gray-500">Combined status for eBay, TikTok Shop, and Temu.</p>
      </div>

      <Link
        to="/market-research"
        className="group flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 p-5 text-white shadow-lg transition hover:shadow-xl sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl font-bold backdrop-blur-xs">
            ✦
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-base">Autonomous AI Product Discovery Agent</h2>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                Live Signals
              </span>
            </div>
            <p className="mt-0.5 text-xs text-indigo-200">
              Scan high-velocity sales trends, analyze profit margins, and import winning products directly into your catalog.
            </p>
          </div>
        </div>
        <div className="keep-light inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-indigo-900 shadow-sm transition group-hover:bg-indigo-50">
          Open Product Discovery →
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} className="" />
        ))}
      </div>

    </div>
  )
}

