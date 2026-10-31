import { useEffect, useRef, useState } from 'react'
import { BsThreeDotsVertical } from 'react-icons/bs'

// Kebab menu for table rows. Fixed-positioned so overflow-x tables never clip it.
// items: [{ label, danger?, onClick }]
export default function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  const toggle = (e) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 160) })
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open ])

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Row actions" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
        <BsThreeDotsVertical />
      </button>
      {open && (
        <div
          className="fixed z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => { setOpen(false); it.onClick() }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${it.danger ? 'text-red-600' : 'text-gray-700'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
