import { useNavigate } from 'react-router-dom'
import {
  FiLoader,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiDownload,
  FiSearch,
} from 'react-icons/fi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

// ─── Status badge ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  queued:    { label: 'Queued',    color: 'amber', icon: FiClock },
  running:   { label: 'Running…', color: 'blue',  icon: FiLoader },
  completed: { label: 'Completed', color: 'green', icon: FiCheckCircle },
  failed:    { label: 'Failed',    color: 'red',   icon: FiAlertTriangle },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued
  const Icon = cfg.icon
  const colorMap = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue:  'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:   'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colorMap[cfg.color]}`}>
      <Icon size={12} className={status === 'running' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

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
 */
export default function MarketResearchPageTable({ reports = [], onExcelDownload }) {
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
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-gray-50/80">
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-semibold">Generated</th>
                <th className="px-4 py-3 font-semibold">Categories</th>
                <th className="px-4 py-3 font-semibold">Status</th>
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
                return (
                  <tr key={meta.id} className="transition hover:bg-gray-50/60">
                    {/* Date + niche */}
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-gray-900">{formatDate(meta.createdAt)}</span>
                      {meta.niche && (
                        <span className="block text-xs text-gray-400">Niche: {meta.niche}</span>
                      )}
                    </td>

                    {/* Categories */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {meta.categories.map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={meta.status} />
                      {isFailed && meta.error && (
                        <p
                          className="mt-1 max-w-[160px] truncate text-xs text-red-500"
                          title={meta.error}
                        >
                          {meta.error}
                        </p>
                      )}
                    </td>

                    {/* Market Analysis */}
                    <td className="px-4 py-3.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isCompleted}
                        onClick={() => navigate(`/market-research/${meta.id}/analysis`)}
                      >
                        View
                      </Button>
                    </td>

                    {/* Recommendations */}
                    <td className="px-4 py-3.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isCompleted}
                        onClick={() => navigate(`/market-research/${meta.id}/recommendations`)}
                      >
                        View
                      </Button>
                    </td>

                    {/* Research Report */}
                    <td className="px-4 py-3.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isCompleted}
                        onClick={() => navigate(`/market-research/${meta.id}/report`)}
                      >
                        View
                      </Button>
                    </td>

                    {/* Excel Export */}
                    <td className="px-4 py-3.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isCompleted}
                        onClick={() => onExcelDownload?.(meta.id)}
                        className="flex items-center gap-1.5"
                      >
                        <FiDownload size={13} />
                        <span>.xlsx</span>
                      </Button>
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
