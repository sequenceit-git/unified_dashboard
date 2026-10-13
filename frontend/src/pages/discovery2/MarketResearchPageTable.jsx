import { useNavigate } from 'react-router-dom'
import {
  FiDownload,
  FiSearch,
} from 'react-icons/fi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Normalise report shape (new multi-category vs old single-category)
function getReportMeta(r) {
  return {
    id: r._id,
    createdAt: r.createdAt,
    categories: r.params?.categories || (r.params?.category ? [r.params.category] : ['—']),
    niche: r.params?.keywords?.[0] || '',
    status: r.status || 'completed',
    error: r.error || '',
  }
}

/**
 * MarketResearchPageTable
 *
 * Props:
 *   reports         {Array}    – list of ResearchReport documents from the API
 *   onExcelDownload {Function} – called with reportId when the .xlsx button is clicked
 *   onCsvDownload   {Function} – called with reportId when the .csv button is clicked
 */
export default function MarketResearchPageTable({ reports = [], onExcelDownload, onCsvDownload }) {
  const navigate = useNavigate()

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Research Reports</h2>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          {reports.length} {reports.length === 1 ? 'Report' : 'Reports'}
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="py-12 text-center">
          <FiSearch size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No research reports yet.</p>
          <p className="mt-1 text-xs text-gray-400">Click "New Research Run" to generate your first report.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-gray-50/80">
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-semibold">Generated</th>
                <th className="px-4 py-3 font-semibold">Market Analysis</th>
                <th className="px-4 py-3 font-semibold">Recommendations</th>
                <th className="px-4 py-3 font-semibold">Research Report</th>
                <th className="px-4 py-3 font-semibold">Excel Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((row) => {
                const meta = getReportMeta(row)
                const isCompleted = meta.status === 'completed'
                const isFailed = meta.status === 'failed'

                // Status underline color & indicator:
                // green (completed), blue (running), amber (queued), red (failed)
                const underlineColor = {
                  completed: 'bg-emerald-500',
                  running:   'bg-blue-500 animate-pulse',
                  queued:    'bg-amber-400',
                  failed:    'bg-red-500',
                }[meta.status] || 'bg-amber-400'

                const statusLabel = {
                  completed: 'Status: Completed',
                  running:   'Status: Running…',
                  queued:    'Status: Queued',
                  failed:    `Status: Failed${meta.error ? ` (${meta.error})` : ''}`,
                }[meta.status] || 'Status: Queued'

                return (
                  <tr key={meta.id} className="transition hover:bg-gray-50/60">
                    {/* Date + niche */}
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-gray-900">{formatDate(meta.createdAt)}</span>
                      {meta.niche && (
                        <span className="block text-xs text-gray-400">Niche: {meta.niche}</span>
                      )}
                    </td>

                    {/* Market Analysis */}
                    <td className="px-4 py-3.5">
                      <div className="inline-flex flex-col items-center">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!isCompleted}
                          onClick={() => navigate(`/market-research/${meta.id}/analysis`)}
                        >
                          View
                        </Button>
                        <span
                          className={`mt-1.5 h-1 w-full rounded-full ${underlineColor}`}
                          title={statusLabel}
                        />
                      </div>
                    </td>

                    {/* Recommendations */}
                    <td className="px-4 py-3.5">
                      <div className="inline-flex flex-col items-center">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!isCompleted}
                          onClick={() => navigate(`/market-research/${meta.id}/recommendations`)}
                        >
                          View
                        </Button>
                        <span
                          className={`mt-1.5 h-1 w-full rounded-full ${underlineColor}`}
                          title={statusLabel}
                        />
                      </div>
                    </td>

                    {/* Research Report */}
                    <td className="px-4 py-3.5">
                      <div className="inline-flex flex-col items-center">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!isCompleted}
                          onClick={() => navigate(`/market-research/${meta.id}/report`)}
                        >
                          View
                        </Button>
                        <span
                          className={`mt-1.5 h-1 w-full rounded-full ${underlineColor}`}
                          title={statusLabel}
                        />
                      </div>
                    </td>

                    {/* Excel / CSV Export */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!isCompleted}
                          onClick={() => onExcelDownload?.(meta.id)}
                          className="flex items-center gap-1.5"
                          title="Download Excel spreadsheet"
                        >
                          <FiDownload size={13} />
                          <span>.xlsx</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!isCompleted}
                          onClick={() => onCsvDownload?.(meta.id)}
                          className="flex items-center gap-1.5"
                          title="Download CSV file"
                        >
                          <FiDownload size={13} />
                          <span>CSV</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
