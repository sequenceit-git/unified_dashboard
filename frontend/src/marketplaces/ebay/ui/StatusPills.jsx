/** eBay status pills with counts: the main filter of a list page. */
export default function StatusPills({ pills, active, onChange }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {pills.map((p) => {
        const on = p.key === active
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(p.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              on
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {p.label}
            {p.count != null && <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20' : 'bg-gray-100 dark:bg-slate-800'}`}>{p.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
