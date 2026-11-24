/** TikTok's Shop Performance Score, benefits and the metrics that need work (each with Diagnose). */
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'

export default function ShopHealth({ health, loading, error, onRetry, onDiagnose }) {
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Shop health</h2>
        {!loading && health.score != null && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Score <span className="text-lg font-bold text-gray-900 dark:text-white">{health.score}</span>
            {health.tier && <> · {health.tier}</>}
            {health.peers && <> · better than {health.peers} of peers</>}
            {health.benefits && <> · benefits {health.benefits}</>}
          </p>
        )}
      </div>
      {loading && <Spinner />}
      {!loading && (error || health.error) && <ErrorState message={error || health.error} onRetry={onRetry} />}
      {!loading && !error && !health.error && health.allGood && (
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><FiCheckCircle aria-hidden="true" /> All metrics on track</p>
      )}
      {!loading && !error && health.problems.length > 0 && (
        <ul className="mt-3 space-y-2">
          {health.problems.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <span className="flex items-start gap-2">
                <FiAlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  <strong>{p.metric}</strong> {p.value}{p.target && <> (excellent at {p.target})</>} · {p.status}
                  {p.reason && <span className="block text-xs opacity-80">{p.reason}</span>}
                </span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => onDiagnose(p.id)}>Diagnose</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
