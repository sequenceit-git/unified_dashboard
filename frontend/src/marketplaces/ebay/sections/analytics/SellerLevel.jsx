/** eBay seller level per program (with Metrics) and service rates against similar sellers. */
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'

const LEVEL_STYLE = {
  TOP_RATED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  ABOVE_STANDARD: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  BELOW_STANDARD: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
}

export default function SellerLevel({ standards, service, loading, error, onRetry, onDetail }) {
  return (
    <Card className="min-w-0">
      <h2 className="mb-2 font-semibold">Seller level</h2>
      {loading && <Spinner />}
      {!loading && error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && (
        <div className="space-y-4 text-sm">
          {standards?.error && <p className="text-rose-600">{standards.error}</p>}
          {!standards?.error && (
            <ul className="space-y-2">
              {(standards?.rows || []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 dark:border-slate-700">
                  <span>
                    <strong>{s.program}</strong> <span className="text-gray-500">({s.cycle})</span>{' '}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[s.levelCode] || 'bg-gray-100 dark:bg-slate-800'}`}>{s.level || '—'}</span>
                    <span className="block text-xs text-gray-500">Defects {s.defectRate || '—'} · Late shipment {s.lateShipmentRate || '—'} · Cases closed {s.casesClosed || '—'}</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => onDetail({ action: 'standards', id: s.id })}>Metrics</Button>
                </li>
              ))}
              {!(standards?.rows || []).length && <li className="text-gray-500">eBay sent no seller level yet</li>}
            </ul>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Returns and not-received vs similar sellers</p>
            {service?.error && <p className="text-rose-600">{service.error}</p>}
            {!service?.error && (
              (service?.rows || []).length
                ? (
                  <ul className="space-y-1">
                    {service.rows.map((m) => (
                      <li key={`${m.metric}:${m.category}`} className="flex flex-wrap justify-between gap-2">
                        <span>{m.metric}{m.category && <span className="text-gray-500"> · {m.category}</span>}</span>
                        <span className={['HIGH', 'VERY_HIGH'].includes(m.ratingCode) ? 'font-semibold text-rose-600' : ''}>{m.yourRate || '—'} vs {m.peerRate || '—'} · {m.rating || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="text-gray-500">No rates from eBay yet</p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
