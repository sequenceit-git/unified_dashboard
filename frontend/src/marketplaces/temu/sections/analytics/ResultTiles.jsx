/** Revenue, orders, average order and profit with the change vs the previous period; returns per 100 orders. */
import Card, { StatCard } from '../../../../components/ui/Card'
import { ErrorState } from '../../../../components/ui/Feedback'
import { change, margin } from './analyticsView'

const money = (n) => `$${Number(n || 0).toFixed(2)}`

function Change({ value }) {
  if (value == null) return <span className="text-gray-400">— vs previous period</span>
  const up = value >= 0
  return <span className={up ? 'text-emerald-600' : 'text-rose-600'}>{up ? '▲' : '▼'} {Math.abs(value)}% vs previous period</span>
}

export default function ResultTiles({ current, previous, loading, error, onRetry, returnsPer100 }) {
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>
  const c = current || {}
  const p = previous || {}
  const show = (v) => (loading ? '…' : v)
  const m = margin(c.profit, c.revenue)
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Revenue" value={show(money(c.revenue))} sub={!loading && <Change value={change(c.revenue, p.revenue)} />} />
      <StatCard label="Orders" value={show(c.orders ?? 0)} sub={!loading && <Change value={change(c.orders, p.orders)} />} />
      <StatCard label="Avg order" value={show(money(c.avgOrder))} sub={!loading && <Change value={change(c.avgOrder, p.avgOrder)} />} />
      <StatCard
        label="Profit"
        value={show(money(c.profit))}
        sub={!loading && <>{m != null && <span className="mr-1">{m}% margin ·</span>}<Change value={change(c.profit, p.profit)} /></>}
      />
      <StatCard label="Returns per 100 orders" value={returnsPer100 == null ? '—' : returnsPer100} sub="Last 30 days" />
    </div>
  )
}
