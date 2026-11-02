import { useEffect, useRef, useState, forwardRef, useId } from 'react'
import { createPortal } from 'react-dom'
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
  const [menuStyle, setMenuStyle] = useState(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const listboxId = useId()

  const setButtonRef = (el) => {
    buttonRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const normalizedOptions = options.map((o) =>
    typeof o === 'object' && o !== null ? o : { value: o, label: String(o) }
  )

  const selectedIndex = normalizedOptions.findIndex(
    (o) => String(o.value ?? '') === String(value ?? '')
  )
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null
  const displayLabel = selectedOption?.label ?? placeholder

  const updatePosition = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()

    // If trigger button scrolled completely off viewport, dismiss
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false)
      return
    }

    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const estimatedHeight = 220

    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow
    const triggerWidth = rect.width
    const minWidth = Math.max(triggerWidth, 200)
    const maxWidth = Math.min(420, window.innerWidth - 16)

    let left = rect.left
    if (left + minWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - minWidth)
    }

    const style = {
      position: 'fixed',
      left: `${left}px`,
      width: `${triggerWidth}px`,
      minWidth: `${minWidth}px`,
      maxWidth: `${maxWidth}px`,
      zIndex: 9999,
    }

    if (openUp) {
      style.bottom = `${window.innerHeight - rect.top + 4}px`
      style.maxHeight = `${Math.max(120, Math.min(240, spaceAbove - 16))}px`
    } else {
      style.top = `${rect.bottom + 4}px`
      style.maxHeight = `${Math.max(120, Math.min(240, spaceBelow - 16))}px`
    }

    setMenuStyle(style)
  }

  const toggle = () => {
    if (disabled) return
    if (!open) {
      updatePosition()
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1)
      return undefined
    }

    updatePosition()

    const handleOutside = (e) => {
      if (
        (buttonRef.current && buttonRef.current.contains(e.target)) ||
        (menuRef.current && menuRef.current.contains(e.target))
      ) {
        return
      }
      setOpen(false)
    }

    const handleScroll = () => {
      updatePosition()
    }

    const handleResize = () => {
      updatePosition()
    }

    window.addEventListener('mousedown', handleOutside)
    window.addEventListener('touchstart', handleOutside, { passive: true })
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('touchstart', handleOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  useEffect(() => {
    if (open && highlightedIndex >= 0 && menuRef.current) {
      const activeEl = menuRef.current.children[highlightedIndex]
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, open])

  const handleSelect = (val) => {
    setOpen(false)
    buttonRef.current?.focus()
    if (onChange) {
      onChange({
        target: { value: val, name: props.name },
        currentTarget: { value: val, name: props.name },
      })
    }
  }

  const handleKeyDown = (e) => {
    if (disabled) return

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        updatePosition()
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
        setOpen(true)
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => {
        const next = prev < normalizedOptions.length - 1 ? prev + 1 : 0
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : normalizedOptions.length - 1
        return next
      })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < normalizedOptions.length) {
        const opt = normalizedOptions[highlightedIndex]
        if (!opt.disabled) {
          handleSelect(opt.value)
        }
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={`relative min-w-0 ${className}`}>
      {label && <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>}
      <button
        ref={setButtonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={props['aria-label'] || (typeof label === 'string' ? label : undefined)}
        onClick={toggle}
        onKeyDown={handleKeyDown}
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

      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={props['aria-label'] || (typeof label === 'string' ? label : undefined)}
          onWheel={(e) => e.stopPropagation()}
          className="overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-100"
          style={menuStyle}
        >
          {normalizedOptions.map((o, idx) => {
            const isSelected = String(o.value ?? '') === String(value ?? '')
            const isHighlighted = idx === highlightedIndex
            return (
              <button
                key={o.value ?? idx}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={o.disabled}
                title={o.label}
                onClick={() => handleSelect(o.value)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs sm:text-sm transition ${
                  o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : isHighlighted
                    ? 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="truncate pr-2 flex-1 min-w-0">{o.label}</span>
                {isSelected && <FiCheck size={14} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
})
