import { EmptyState, Spinner, ErrorState } from './Feedback'

// columns: [{ key, label, sortable?, render?(row) }]
// sort: '-key' | 'key' — click a sortable header to toggle.
export default function DataTable({ columns, rows, loading, error, onRetry, sort, onSort, rowKey = '_id', onRowClick }) {
  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!rows?.length) return <EmptyState />

  const arrow = (c) => {
    const key = c.sortKey || c.key
    if (sort?.replace(/^-/, '') !== key) return ''
    return sort.startsWith('-') ? ' ↓' : ' ↑'
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[580px] sm:min-w-[640px] text-left text-xs sm:text-sm">
        <thead className="bg-gray-50/80">
          <tr className="border-b border-gray-200 text-[11px] sm:text-xs uppercase tracking-wide text-gray-500">
            {columns.map((c) => (
              <th key={c.key} className="px-2.5 py-2 sm:px-3 sm:py-2.5 font-medium whitespace-nowrap">
                {c.sortable ? (
                  <button onClick={() => onSort?.(c.sortKey || c.key)} className="font-semibold hover:text-gray-800">
                    {c.label}
                    {arrow(c)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-gray-100 hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-2.5 py-2 sm:px-3 sm:py-3">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
