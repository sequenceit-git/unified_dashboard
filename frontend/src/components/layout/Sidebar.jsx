import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const LINKS = [
  { to: '/', label: 'Overview', route: 'dashboard', end: true },
  { to: '/analytics', label: 'Analytics', route: 'analytics' },
  { to: '/inbox', label: 'Inbox', route: 'inbox' },
  { to: '/products', label: 'Products', route: 'products' },
  { to: '/inventory', label: 'Inventory', route: 'inventory' },
  { to: '/orders', label: 'Orders', route: 'orders' },
  { to: '/customers', label: 'Customers', route: 'customers' },
]

export default function Sidebar({ open, onClose }) {
  const { hasRoute, isAdmin } = useAuth()
  const visibleLinks = LINKS.filter((link) => hasRoute(link.route))
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-40 w-64 transform border-r border-[#E2E8F0] bg-white p-0 text-[#0F172A] shadow-2xl transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full w-full overflow-y-auto pt-6">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={onClose}
              className={({ isActive }) =>
                `block w-full px-12 py-4 text-[15px] font-semibold transition ${
                isActive ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
                `block w-full px-12 py-4 text-[15px] font-semibold transition ${
                  isActive ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
