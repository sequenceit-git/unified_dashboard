import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const LINKS = [
  { to: '/', label: 'Overview', route: 'dashboard', end: true },
  { to: '/analytics', label: 'Analytics', route: 'analytics' },
  { to: '/products', label: 'Products', route: 'products' },
  { to: '/inventory', label: 'Inventory', route: 'inventory' },
  { to: '/orders', label: 'Orders', route: 'orders' },
  { to: '/customers', label: 'Customers', route: 'customers' },
  { to: '/inbox', label: 'Inbox', route: 'inbox' },
]

export default function Sidebar({ open, onClose }) {
  const { hasRoute, isAdmin } = useAuth()
  const visibleLinks = LINKS.filter((link) => hasRoute(link.route))
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-40 w-64 transform bg-[#171b35] p-4 text-white shadow-2xl transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="space-y-1.5 overflow-y-auto">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/sub-admins"
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              Sub-admins
            </NavLink>
          )}
        </nav>
      </aside>
    </>
  )
}
