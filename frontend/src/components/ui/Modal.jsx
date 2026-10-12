import { useEffect } from 'react'

export default function Modal({ title, onClose, children, wide = false, size = '' }) {
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-h-[92vh] flex flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
