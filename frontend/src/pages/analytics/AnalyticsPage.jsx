import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { queryString } from '../../lib/api'
import { StatCard } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import { useApi } from '../../hooks/useApi'
import MarketplaceChart from './MarketplaceChart'
import RevenueChart from './RevenueChart'
import TopProducts from './TopProducts'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

function rangeParams(days) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end.getTime() - (Number(days) - 1) * 86400000)
  start.setHours(0, 0, 0, 0)
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  }
}

function toIsoSafe(dateStr, isEnd = false) {
  if (!dateStr) return ''
  const d = new Date(isEnd ? `${dateStr}T23:59:59.999` : `${dateStr}T00:00:00.000`)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

export default function AnalyticsPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [days, setDays] = useState('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = useMemo(() => {
    if (customFrom || customTo) {
      return {
        from: toIsoSafe(customFrom, false),
        to: toIsoSafe(customTo, true),
      }
    }
    return rangeParams(days)
  }, [days, customFrom, customTo])

  const summary = useApi(token ? `/api/analytics/summary${queryString({ from, to, marketplace })}` : null)
  const revenue = useApi(token ? `/api/analytics/revenue${queryString({ from, to, marketplace })}` : null)
  const markets = useApi(token ? `/api/analytics/marketplaces${queryString({ from, to, marketplace })}` : null)
  const top = useApi(token ? `/api/analytics/products${queryString({ from, to, marketplace, limit: 10 })}` : null)
  const inv = useApi(token && marketplace ? `/api/analytics/inventory${queryString({ marketplace })}` : null)

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">{section.label} analytics</h1>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
          <Select
            value={days}
            onChange={(e) => {
              setDays(e.target.value)
              setCustomFrom('')
              setCustomTo('')
            }}
            options={RANGES}
          />
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            aria-label="Analytics from date"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            aria-label="Analytics to date"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Revenue" value={summary.loading ? '…' : `$${(summary.data?.revenue ?? 0).toFixed(2)}`} />
        <StatCard label="Orders" value={summary.loading ? '…' : (summary.data?.orders ?? 0)} />
        <StatCard label="Avg order" value={summary.loading ? '…' : `$${(summary.data?.avgOrder ?? 0).toFixed(2)}`} />
        <StatCard
          label="Profit"
          value={summary.loading ? '…' : `$${(summary.data?.profit ?? 0).toFixed(2)}`}
          sub="Sell price − base price"
        />
        <StatCard label="Low stock" value={inv.loading ? '…' : (inv.data?.lowCount ?? 0)} sub={inv.data ? `${inv.data.outCount ?? 0} out of stock` : ''} />
      </div>

      <RevenueChart data={revenue.data} />

      <div className="grid gap-3 lg:grid-cols-2">
        <MarketplaceChart data={markets.data} />
        <TopProducts rows={top.data} loading={top.loading} error={top.error} onRetry={top.refetch} />
      </div>
    </div>
  )
}
