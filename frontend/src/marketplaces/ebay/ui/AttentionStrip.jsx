/** eBay "Needs attention": shown only when something is wrong; each item leads to its fix. */
import { FiAlertTriangle } from 'react-icons/fi'

export default function AttentionStrip({ items, onPick }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Needs attention</p>
      <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onPick(item)} className="inline-flex items-center gap-1.5 text-left text-sm text-amber-900 underline-offset-2 hover:underline dark:text-amber-100">
              <FiAlertTriangle aria-hidden="true" className="shrink-0" /> {item.text}{item.action ? ` → ${item.action}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
