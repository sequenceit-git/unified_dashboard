import { useEffect, useRef, useState, forwardRef } from 'react'
import { FiCheck, FiChevronDown } from 'react-icons/fi'

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block min-w-0">
      {label && <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>}
      <input
        className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:py-2.5 sm:text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
        {...props}
      />
    </label>
  )
}

export const Select = forwardRef(function Select(
  { label, options = [], value, onChange, className = '', disabled = false, placeholder = 'Select…', ...props },
  ref
) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const normalizedOptions = options.map((o) =>
    typeof o === 'object' && o !== null ? o : { value: o, label: String(o) }
  )

  const selectedOption = normalizedOptions.find(
    (o) => String(o.value ?? '') === String(value ?? '')
  )

  const displayLabel = selectedOption?.label ?? placeholder

  useEffect(() => {
    if (!open) return undefined
    const handleOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleOutside)
    window.addEventListener('touchstart', handleOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('touchstart', handleOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (val) => {
    setOpen(false)
    if (onChange) {
      onChange({
        target: { value: val, name: props.name },
        currentTarget: { value: val, name: props.name },
      })
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {label && <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>}
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={props['aria-label'] || (typeof label === 'string' ? label : undefined)}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium shadow-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer'
        } ${open ? 'border-indigo-500 ring-4 ring-indigo-500/10' : ''}`}
      >
        <span className="truncate">{displayLabel}</span>
        <FiChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180 text-indigo-500' : ''}`}
        />
      </button>

      {/* Hidden select to ensure form bindings and browser autofill work */}
      <select
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        name={props.name}
      >
        {normalizedOptions.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
        >
          {normalizedOptions.map((o) => {
            const isSelected = String(o.value ?? '') === String(value ?? '')
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={o.disabled}
                onClick={() => handleSelect(o.value)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs sm:text-sm transition ${
                  o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="truncate pr-2">{o.label}</span>
                {isSelected && <FiCheck size={14} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
