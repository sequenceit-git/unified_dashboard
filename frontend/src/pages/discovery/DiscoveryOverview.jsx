const METRICS = [
  { key: 'totalRecommendations', label: 'Recommendations' },
  { key: 'highScoreCount', label: 'High potential' },
  { key: 'totalReports', label: 'Research runs' },
  { key: 'lastRun', label: 'Last run' },
]

export default function DiscoveryOverview({ stats = {}, loading = false }) {
  const lastRun = stats.lastRunDate
    ? new Date(stats.lastRunDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'None yet'

  const values = {
    totalRecommendations: stats.totalRecommendations ?? 0,
    highScoreCount: stats.highScoreCount ?? 0,
    totalReports: stats.totalReports ?? 0,
    lastRun,
  }

  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:grid-cols-4">
      {METRICS.map((metric, index) => (
        <div
          key={metric.key}
          className={`px-4 py-3 ${index % 2 === 1 ? 'border-l border-gray-200' : ''} ${index >= 2 ? 'border-t border-gray-200 sm:border-t-0' : ''} ${index >= 2 ? 'sm:border-l' : ''}`}
        >
          <dt className="text-xs font-medium text-gray-500">{metric.label}</dt>
          <dd className="mt-1 truncate text-2xl font-bold tracking-tight text-gray-900">
            {loading ? '…' : values[metric.key]}
          </dd>
        </div>
      ))}
    </dl>
  )
}
