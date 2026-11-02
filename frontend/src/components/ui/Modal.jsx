import { useEffect } from 'react'

export default function Modal({ title, onClose, children, wide = false, size = '', closeOnBackdrop = true }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const maxWidthClass =
    size === '5xl' || size === '2xl' ? 'sm:max-w-5xl' :
    size === '4xl' ? 'sm:max-w-4xl' :
    wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:items-center sm:p-4 overflow-x-hidden"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`w-full max-w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-2xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-2xl sm:rounded-2xl ${maxWidthClass} min-w-0 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3 sm:px-6 sm:py-4 min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-100 truncate pr-2 flex-1 min-w-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
