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
      {open && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-[#171b35] p-4 text-white shadow-2xl transition-transform lg:static lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-2 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 text-sm font-black shadow-lg shadow-indigo-950/30">EP</span>
          <div>
            <p className="text-sm font-bold tracking-tight">EcomPilotPro</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-indigo-200/70">Command center</p>
          </div>
        </div>
        <nav className="mt-5 space-y-1.5">
          {LINKS.map((l) => (
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
        </nav>
      </aside>
    </>
  )
}
