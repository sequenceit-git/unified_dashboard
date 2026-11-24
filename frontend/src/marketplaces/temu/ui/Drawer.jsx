/**
 * Temu side drawer: looking at one thing (an order, a return…) while the list stays visible. Header
 * and footer stay put; the body scrolls. Esc or the backdrop closes it.
 */
import { useEffect, useRef } from 'react'
import { FiX } from 'react-icons/fi'

export default function Drawer({ title, subtitle, onClose, footer, children }) {
  const panel = useRef(null)
  // The latest close handler, so the setup below runs once (it must not pull focus while typing).
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    // Esc closes the drawer unless something inside it (a popup) already handled the key.
    // A popup open on top of the drawer handles its own Esc; the drawer stays.
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[data-modal]')) close.current() }
    window.addEventListener('keydown', onKey)
    // The page behind doesn't scroll while the drawer is open; focus moves into the drawer.
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = before
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <aside ref={panel} tabIndex={-1} className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl outline-none dark:bg-slate-900">
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
