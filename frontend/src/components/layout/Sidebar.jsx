import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/analytics', label: 'Analytics' },
  { to: '/products', label: 'Products' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/orders', label: 'Orders' },
  { to: '/customers', label: 'Customers' },
  { to: '/inbox', label: 'Inbox' },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 transform bg-gray-900 p-4 text-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <p className="px-2 py-3 text-lg font-bold">Unified Dashboard</p>
        <nav className="mt-2 space-y-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-600' : 'text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
