/** Problems that exist now (seller level, service rates, stock); "All good" only when every check ran. */
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'
import { attentionStatus } from './analyticsView'

export default function NeedsAttention({ items, loading, error, onRetry, onDetail }) {
  const status = attentionStatus({ items, loading, error })
  if (status === 'loading') return <Card className="text-sm text-gray-500">Checking your eBay shop…</Card>
  if (status === 'error') {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-700 dark:text-rose-300">
        <span>Couldn't check your eBay shop: {error}</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
      </Card>
    )
  }
  if (status === 'all-good') {
    return (
      <Card className="flex items-center gap-2 border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <FiCheckCircle aria-hidden="true" /> All good
      </Card>
    )
  }
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <h2 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-100">Needs attention</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
            <FiAlertTriangle aria-hidden="true" className="shrink-0" />
            {item.to && <Link to={item.to} className="underline-offset-2 hover:underline">{item.text} →</Link>}
            {item.detail && <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onDetail(item.detail)}>{item.text} → Metrics</button>}
            {!item.to && !item.detail && <span>{item.text}</span>}
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
          Couldn't check everything: {error}
          <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
        </p>
      )}
    </Card>
  )
}
