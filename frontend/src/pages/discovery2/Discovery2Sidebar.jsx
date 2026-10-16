import { FiClock } from 'react-icons/fi'

const STATUS_DOT = {
  completed: 'bg-emerald-500',
  running: 'bg-blue-500',
  queued: 'bg-amber-500',
  failed: 'bg-red-500',
}

export default function Discovery2Sidebar({
  reports = [],
  selectedReportId = null,
  onSelectReport = () => {},
}) {
  if (!reports.length) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Research runs</h2>
        <span className="text-xs text-gray-500">{reports.length} saved</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {reports.map((report) => {
          const isSelected = selectedReportId === report._id
          const dateObj = new Date(report.createdAt || Date.now())
          const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          const categories = report.params?.categories || (report.params?.category ? [report.params.category] : [])
          const catLabel = categories.length > 0 ? categories.slice(0, 2).join(', ') : 'All categories'
          const dot = STATUS_DOT[report.status] || 'bg-gray-300'

          return (
            <button
              key={report._id}
              type="button"
              onClick={() => onSelectReport(report._id)}
              aria-pressed={isSelected}
              className={`flex w-44 shrink-0 flex-col rounded-xl border px-3 py-2.5 text-left transition ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50 shadow-xs'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${isSelected ? 'text-indigo-950' : 'text-gray-900'}`}>{formattedDate}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={report.status || 'unknown'} />
              </span>
              <span className="mt-1 truncate text-xs text-gray-500">{catLabel}</span>
              <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                <FiClock size={11} />
                {formattedTime}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
