import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FiChevronDown } from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'

const LINKS = [
  { to: '/discovery', label: 'Product Discovery', route: 'discovery' },
  { to: '/', label: 'Overview', route: 'dashboard', end: true },
  { to: '/analytics', label: 'Analytics', route: 'analytics' },
  { to: '/market-research', label: 'Product Discover 2', route: 'market-research' },
  { to: '/inbox', label: 'Inbox', route: 'inbox' },
  { to: '/products', label: 'Products', route: 'products' },
  { to: '/inventory', label: 'Inventory', route: 'inventory' },
  { to: '/orders', label: 'Orders', route: 'orders' },
  { to: '/customers', label: 'Customers', route: 'customers' },
]

const SUPPORT_LINKS = [
  { to: '/support/chat-sandbox', label: 'Chat Sandbox' },
  { to: '/support/settings', label: 'AI Agent Settings' },
]

export default function Sidebar({ open, onClose }) {
  const { hasRoute, isAdmin } = useAuth()
  const location = useLocation()
  const visibleLinks = LINKS.filter((link) => hasRoute(link.route))

  const showSupport = hasRoute('customer-support')
  const supportActive = location.pathname.startsWith('/support')
  const [supportOpen, setSupportOpen] = useState(supportActive)

  useEffect(() => {
    if (supportActive) setSupportOpen(true)
  }, [supportActive])

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

          {showSupport && (
            <div>
              <button
                type="button"
                aria-expanded={supportOpen}
                onClick={() => setSupportOpen((value) => !value)}
                className={`flex w-full items-center justify-between px-12 py-4 text-left text-[15px] font-semibold transition ${
                  supportActive ? 'text-[#4F46E5]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>Customer Support AI</span>
                <FiChevronDown
                  size={16}
                  className={`shrink-0 transition-transform duration-200 ${supportOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {supportOpen && (
                <div className="pb-1">
                  {SUPPORT_LINKS.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `block w-full py-3 pl-14 pr-8 text-sm font-medium transition ${
                          isActive
                            ? 'border-r-2 border-[#4F46E5] bg-indigo-50/70 text-[#4F46E5]'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`
                      }
                    >
                      {l.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

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
