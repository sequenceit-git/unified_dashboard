/** GMV, orders, average order, visitors, conversion and profit, each against the previous period. */
import Card, { StatCard } from '../../../../components/ui/Card'
import { ErrorState } from '../../../../components/ui/Feedback'
import { change, pointsChange } from './analyticsView'

const money = (n) => `$${Number(n || 0).toFixed(2)}`

function Change({ value, unit = '%' }) {
  if (value == null) return <span className="text-gray-400">— vs previous period</span>
  const up = value >= 0
  return <span className={up ? 'text-emerald-600' : 'text-rose-600'}>{up ? '▲' : '▼'} {Math.abs(value)}{unit === 'pt' ? ' pts' : '%'} vs previous period</span>
}

const NOT_SHARED = "TikTok isn't sharing this data"

export default function ResultTiles({ now, before, profit, prevProfit, loading, error, onRetry, traffic }) {
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>
  const show = (v) => (loading ? '…' : v)
  const margin = profit != null && now.gmv > 0 ? Math.round((profit / now.gmv) * 1000) / 10 : null
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="GMV"
        value={show(money(now.gmv))}
        sub={!loading && <>{now.refunds != null && <span className="block">{money(now.refunds)} refunded</span>}<Change value={change(now.gmv, before.gmv)} /></>}
      />
      <StatCard label="Orders" value={show(now.orders.toLocaleString())} sub={!loading && <Change value={change(now.orders, before.orders)} />} />
      <StatCard label="Avg order" value={show(money(now.avgOrder))} sub={!loading && <Change value={change(now.avgOrder, before.avgOrder)} />} />
      <StatCard
        label="Visitors / day"
        value={show(now.visitorsPerDay == null ? '—' : now.visitorsPerDay.toLocaleString())}
        sub={!loading && (traffic ? <Change value={change(now.visitorsPerDay, before.visitorsPerDay)} /> : NOT_SHARED)}
      />
      <StatCard
        label="Conversion"
        value={show(now.conversion == null ? '—' : `${now.conversion}%`)}
        sub={!loading && (traffic ? <Change value={pointsChange(now.conversion, before.conversion)} unit="pt" /> : NOT_SHARED)}
      />
      <StatCard
        label="Profit"
        value={show(profit == null ? '—' : money(profit))}
        sub={!loading && <>{margin != null && <span className="mr-1">{margin}% margin ·</span>}<Change value={change(profit, prevProfit)} /></>}
      />
    </div>
  )
}
