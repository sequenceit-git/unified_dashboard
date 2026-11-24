/** Sales (from orders) and traffic (from eBay) against the previous period. */
import Card, { StatCard } from '../../../../components/ui/Card'
import { ErrorState } from '../../../../components/ui/Feedback'
import { change, margin, pointsChange } from './analyticsView'

const money = (n) => `$${Number(n || 0).toFixed(2)}`

function Change({ value, unit = '%' }) {
  if (value == null) return <span className="text-gray-400">— vs previous period</span>
  const up = value >= 0
  return <span className={up ? 'text-emerald-600' : 'text-rose-600'}>{up ? '▲' : '▼'} {Math.abs(value)}{unit === 'pt' ? ' pts' : '%'} vs previous period</span>
}

export function SalesTiles({ now, before, loading, error, onRetry }) {
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>
  const c = now || {}
  const p = before || {}
  const show = (v) => (loading ? '…' : v)
  const m = margin(c.profit, c.revenue)
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Revenue" value={show(money(c.revenue))} sub={!loading && <Change value={change(c.revenue, p.revenue)} />} />
      <StatCard label="Orders" value={show(c.orders ?? 0)} sub={!loading && <Change value={change(c.orders, p.orders)} />} />
      <StatCard label="Avg order" value={show(money(c.avgOrder))} sub={!loading && <Change value={change(c.avgOrder, p.avgOrder)} />} />
      <StatCard label="Profit" value={show(money(c.profit))} sub={!loading && <>{m != null && <span className="mr-1">{m}% margin ·</span>}<Change value={change(c.profit, p.profit)} /></>} />
    </div>
  )
}

export function TrafficTiles({ now, before, loading, error }) {
  if (error) return <Card className="text-sm text-gray-600 dark:text-gray-300">eBay isn't sharing traffic: {error}</Card>
  const show = (v) => (loading ? '…' : v)
  const pct = (v) => (v == null ? '—' : `${v}%`)
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Impressions" value={show(now.impressions.toLocaleString())} sub={!loading && <Change value={change(now.impressions, before.impressions)} />} />
      <StatCard label="Page views" value={show(now.views.toLocaleString())} sub={!loading && <Change value={change(now.views, before.views)} />} />
      <StatCard label="Click-through" value={show(pct(now.ctr))} sub={!loading && <Change value={pointsChange(now.ctr, before.ctr)} unit="pt" />} />
      <StatCard label="Conversion" value={show(pct(now.conversion))} sub={!loading && <Change value={pointsChange(now.conversion, before.conversion)} unit="pt" />} />
    </div>
  )
}
