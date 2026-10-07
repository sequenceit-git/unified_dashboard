import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { queryString } from '../lib/api'
import { MARKETPLACES } from '../lib/marketplaces'
import { StatCard } from '../components/ui/Card'
import { Select } from '../components/ui/Input'
import Tabs from '../components/ui/Tabs'
import { useApi } from '../hooks/useApi'
import MarketplaceChart from './analytics/MarketplaceChart'
import RevenueChart from './analytics/RevenueChart'
import TopProducts from './analytics/TopProducts'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

function rangeParams(days) {
  const to = new Date().toISOString()
  const from = new Date(Date.now() - (Number(days) - 1) * 86400000).toISOString()
  return { from, to }
}

export default function AnalyticsPage() {
  const { token } = useAuth()
  const [days, setDays] = useState('30')
  const [marketplace, setMarketplace] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const { from: presetFrom, to: presetTo } = rangeParams(days)
  const from = customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : presetFrom
  const to = customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : presetTo

  const summary = useApi(token ? `/api/analytics/summary${queryString({ from, to, marketplace })}` : null, [days, marketplace, customFrom, customTo])
  const revenue = useApi(token ? `/api/analytics/revenue${queryString({ from, to, marketplace })}` : null, [days, marketplace, customFrom, customTo])
  const markets = useApi(token ? `/api/analytics/marketplaces${queryString({ from, to, marketplace })}` : null, [days, marketplace, customFrom, customTo])
  const top = useApi(token ? `/api/analytics/products${queryString({ from, to, marketplace, limit: 10 })}` : null, [days, marketplace, customFrom, customTo])
  const inv = useApi(token ? '/api/analytics/inventory' : null)

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={RANGES} />
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="Analytics from date" />
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="Analytics to date" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={summary.loading ? '…' : `$${summary.data?.revenue?.toFixed(2)}`} />
        <StatCard label="Orders" value={summary.loading ? '…' : summary.data?.orders} />
        <StatCard label="Avg order" value={summary.loading ? '…' : `$${summary.data?.avgOrder?.toFixed(2)}`} />
        <StatCard label="Low stock" value={inv.loading ? '…' : inv.data?.lowCount} sub={inv.data ? `${inv.data.outCount} out of stock` : ''} />
      </div>

      <Tabs tabs={MARKETPLACES} active={marketplace} onChange={setMarketplace} />
      <RevenueChart data={revenue.data} />

      <div className="grid gap-3 lg:grid-cols-2">
        <MarketplaceChart data={markets.data} />
        <TopProducts rows={top.data} loading={top.loading} error={top.error} onRetry={top.refetch} />
      </div>
    </div>
  )
}
