import { FiCalendar, FiClock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

export default function Discovery2Sidebar({
  reports = [],
  selectedReportId = null,
  onSelectReport = () => {},
}) {
  return (
    <aside className="w-full shrink-0 space-y-2 md:w-64 lg:w-72">
      <div className="flex items-center justify-between pb-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Research History
        </h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
          {reports.length}
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
          No research reports found. Run a new research to generate dates.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-y-auto md:max-h-[750px] md:pb-0">
          {reports.map((r) => {
            const isSelected = selectedReportId === r._id
            const dateObj = new Date(r.createdAt || Date.now())
            const formattedDate = dateObj.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            const formattedTime = dateObj.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })

            const categories = r.params?.categories || (r.params?.category ? [r.params.category] : [])
            const catLabel = categories.length > 0 ? categories.slice(0, 2).join(', ') : 'All categories'

            const statusColors = {
              completed: 'text-emerald-500',
              running: 'text-blue-500 animate-spin',
              queued: 'text-amber-500',
              failed: 'text-red-500',
            }[r.status] || 'text-gray-400'

            return (
              <button
                key={r._id}
                type="button"
                onClick={() => onSelectReport(r._id)}
                className={`group flex shrink-0 items-start gap-3 rounded-xl border p-3.5 text-left transition md:w-full ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                  }`}
                >
                  <FiCalendar size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-950' : 'text-gray-900'}`}>
                      {formattedDate}
                    </span>
                    <span className={`text-[11px] ${statusColors}`} title={`Status: ${r.status}`}>
                      {r.status === 'completed' ? '●' : r.status === 'running' ? '◐' : r.status === 'failed' ? '✕' : '○'}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                    {catLabel}
                  </p>

                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <FiClock size={10} />
                    <span>{formattedTime}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
