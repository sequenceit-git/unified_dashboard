/** Problems that exist now, each a link to the page that fixes it; "All good" when there are none. */
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'
import { attentionStatus } from './analyticsView'

export default function NeedsAttention({ items, loading, error, onRetry }) {
  const status = attentionStatus({ items, loading, error })
  if (status === 'loading') return <Card className="text-sm text-gray-500">Checking your Temu shop…</Card>
  if (status === 'error') {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-700 dark:text-rose-300">
        <span>Couldn't check your Temu shop: {error}</span>
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
      <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.to} className="inline-flex items-center gap-1.5 text-sm text-amber-900 underline-offset-2 hover:underline dark:text-amber-100">
              <FiAlertTriangle aria-hidden="true" className="shrink-0" /> {item.text} →
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
