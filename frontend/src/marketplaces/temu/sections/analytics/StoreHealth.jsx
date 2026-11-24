/** Temu's tags on the store and cancellations per 100 orders (Temu's last 30 days). */
import Card from '../../../../components/ui/Card'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'

export default function StoreHealth({ tags, tagsError, cancelsPer100, loading, error, onRetry }) {
  return (
    <Card className="min-w-0">
      <h2 className="mb-2 font-semibold">Store health</h2>
      {loading && <Spinner />}
      {!loading && error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cancellations per 100 orders (last 30 days)</p>
            <p className="mt-1 text-2xl font-bold">{cancelsPer100 == null ? '—' : cancelsPer100}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Temu store tags</p>
            {tagsError && <p className="mt-1 text-rose-600">{tagsError}</p>}
            {!tagsError && (tags?.length
              ? <ul className="mt-1 flex flex-wrap gap-1.5">{tags.map((t) => <li key={t.tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-slate-800">{t.tag}</li>)}</ul>
              : <p className="mt-1 text-gray-500">No tags from Temu</p>)}
          </div>
        </div>
      )}
    </Card>
  )
}
