/** Each listing's traffic (last 30 days), with a badge when buyers see it but rarely open it. */
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'
import { rarelyClicked } from './analyticsView'

export default function ListingsTable({ table, loading, error, onRetry }) {
  const rows = (table?.rows || []).map((r) => ({ ...r, _key: r.listingId }))
  const flagged = rarelyClicked(rows)
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="font-semibold">Listings <span className="text-xs font-normal text-gray-500">(last 30 days)</span></h2>
      <p className="mb-2 text-xs text-gray-500">"Seen, rarely clicked": buyers see it in search but few open it. A better main photo, title or price usually helps.</p>
      <div className="w-full min-w-0 overflow-x-auto">
        <DataTable
          columns={[
            {
              key: 'title',
              label: 'Listing',
              render: (r) => (
                <span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.title || `Item ${r.listingId}`}</a>
                  {flagged.has(r.listingId) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Seen, rarely clicked</span>}
                </span>
              ),
            },
            { key: 'impressions', label: 'Impressions', render: (r) => r.impressions.toLocaleString() },
            { key: 'views', label: 'Views', render: (r) => r.views.toLocaleString() },
            { key: 'ctr', label: 'Click-through', render: (r) => `${r.ctr}%` },
            { key: 'conversion', label: 'Conversion', render: (r) => `${r.conversion}%` },
            { key: 'sold', label: 'Sold' },
          ]}
          rows={rows}
          loading={loading}
          error={error || table?.error || ''}
          onRetry={onRetry}
          rowKey="_key"
        />
      </div>
    </Card>
  )
}
