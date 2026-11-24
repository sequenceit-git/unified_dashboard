/**
 * Temu side drawer: looking at one thing (an order, a return…) while the list stays visible. Header
 * and footer stay put; the body scrolls. Esc or the backdrop closes it.
 */
import { useEffect } from 'react'
import { FiX } from 'react-icons/fi'

export default function Drawer({ title, subtitle, onClose, footer, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><FiX /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 sm:px-5 dark:border-slate-800">{footer}</footer>}
      </aside>
    </div>
  )
}
