/** Formatting for shop section tables (money, dates, status pills) and the table page size. */

export const PAGE_SIZE = 15

export function formatMoney(amount) {
  if (!amount || amount.value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: amount.currency || 'USD' }).format(amount.value)
}

export function formatCell(type, value) {
  if (value == null || value === '') return '—'
  switch (type) {
    case 'money': return <span className={value.value < 0 ? 'text-rose-600' : ''}>{formatMoney(value)}</span>
    case 'date': return new Date(value).toLocaleDateString()
    case 'number': return Number(value).toLocaleString()
    case 'status': return <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</span>
    case 'link': {
      const url = typeof value === 'string' ? value : value?.url
      const label = (typeof value === 'object' ? value?.label : '') || 'Open'
      if (!url || !/^https?:\/\//i.test(url)) return label && label !== 'Open' ? label : '—'
      return (
        <a href={url} target="_blank" rel="noreferrer" className="line-clamp-2 max-w-md font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          {label}
        </a>
      )
    }
    default: return <span className="line-clamp-2 max-w-md">{value}</span>
  }
}
