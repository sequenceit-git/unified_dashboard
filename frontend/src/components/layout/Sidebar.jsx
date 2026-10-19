import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { FiChevronDown, FiSettings } from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'

const TOP_LINKS = [
  { to: '/market-research', label: 'Product Discovery', route: 'market-research' },
  { to: '/', label: 'Overview', route: 'dashboard', end: true },
]

const SHOP_SECTIONS = [
  { id: 'ebay', label: 'eBay', storageKey: 'sidebar-ebay-open', defaultOpen: true },
  { id: 'tiktok', label: 'TikTok Shop', storageKey: 'sidebar-tiktok-open', defaultOpen: false },
  { id: 'temu', label: 'Temu Shop', storageKey: 'sidebar-temu-open', defaultOpen: false },
]

const SHOP_LINKS = [
  { path: '/analytics', label: 'Analytics', route: 'analytics' },
  { path: '/inbox', label: 'Inbox', route: 'inbox' },
  { path: '/products', label: 'Products', route: 'products' },
  { path: '/inventory', label: 'Inventory', route: 'inventory' },
  { path: '/orders', label: 'Orders', route: 'orders' },
  { path: '/customers', label: 'Customers', route: 'customers' },
]

const SUPPORT_LINKS = [
  { to: '/support/buyer-chat', label: 'Buyer Chat (Simulated)' },
  { to: '/support/seller-chat', label: 'Seller Chat (Agent View)' },
  { to: '/support/settings', label: 'AI Agent Settings' },
]

function readOpen(storageKey, defaultOpen) {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === null ? defaultOpen : stored === 'true'
  } catch {
    return defaultOpen
  }
}

function itemClass(nested, on) {
  return `block w-full text-[15px] font-semibold transition ${
    nested ? 'py-3 pl-14 pr-6' : 'px-8 py-4'
  } ${on ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
}

function NavItem({ to, end, onClose, nested, active, children }) {
  if (active !== undefined) {
    return (
      <Link to={to} onClick={onClose} aria-current={active ? 'page' : undefined} className={itemClass(nested, active)}>
        {children}
      </Link>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) => itemClass(nested, isActive)}
    >
      {children}
    </NavLink>
  )
}

function shopLinkActive(pathname, search, link) {
  const shop = new URLSearchParams(search).get('shop')
  if (shop !== link.shop) return false
  return pathname === link.path || pathname.startsWith(`${link.path}/`)
}

function ShopGroup({ section, links, pathname, search, onClose }) {
  const active = links.some((link) => shopLinkActive(pathname, search, link))
  const [open, setOpen] = useState(() => readOpen(section.storageKey, section.defaultOpen))

  const toggle = () => {
    setOpen((current) => {
      const next = !current
      try {
        localStorage.setItem(section.storageKey, String(next))
      } catch {
        // Ignore storage failures and keep the toggle in memory.
      }
      return next
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`${section.id}-shop-nav`}
        className={`flex w-full items-center justify-between px-8 py-3 text-left transition hover:bg-slate-100 ${
          !open && active ? 'bg-indigo-50' : ''
        }`}
      >
        <span className="text-[15px] font-bold text-slate-900">{section.label}</span>
        <FiChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div id={`${section.id}-shop-nav`}>
          {links.map((link) => (
            <NavItem
              key={link.to}
              to={link.to}
              onClose={onClose}
              nested
              active={shopLinkActive(pathname, search, link)}
            >
              {link.label}
            </NavItem>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const { hasRoute, isAdmin } = useAuth()
  const { pathname, search } = useLocation()
  const topLinks = TOP_LINKS.filter((link) => hasRoute(link.route))
  const shopSections = SHOP_SECTIONS.map((section) => ({
    ...section,
    links: SHOP_LINKS.filter((link) => hasRoute(link.route)).map((link) => ({
      ...link,
      shop: section.id,
      to: `${link.path}?shop=${section.id}`,
    })),
  })).filter((section) => section.links.length > 0)

  const showSupport = hasRoute('customer-support')
  const supportActive = pathname.startsWith('/support')
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
          {topLinks.map((link) => (
            <NavItem key={link.to} to={link.to} end={link.end} onClose={onClose}>
              {link.label}
            </NavItem>
          ))}

          {shopSections.length > 0 && (
            <div className="mt-2">
              <p className="px-8 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Shop</p>
              {shopSections.map((section) => (
                <ShopGroup
                  key={section.id}
                  section={section}
                  links={section.links}
                  pathname={pathname}
                  search={search}
                  onClose={onClose}
                />
              ))}
            </div>
          )}

          {showSupport && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                aria-expanded={supportOpen}
                aria-controls="support-nav"
                onClick={() => setSupportOpen((value) => !value)}
                className={`flex w-full items-center justify-between px-8 py-3 text-left transition hover:bg-slate-100 ${
                  !supportOpen && supportActive ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="text-[15px] font-bold text-slate-900">Customer Support AI</span>
                <FiChevronDown
                  size={16}
                  className={`shrink-0 text-slate-400 transition-transform ${supportOpen ? '' : '-rotate-90'}`}
                />
              </button>
              {supportOpen && (
                <div id="support-nav">
                  {SUPPORT_LINKS.map((link) => (
                    <NavItem key={link.to} to={link.to} onClose={onClose} nested active={pathname === link.to}>
                      {link.label}
                    </NavItem>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <NavItem to="/sub-admins" onClose={onClose}>
              Sub-admins
            </NavItem>
          )}
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              `flex w-full items-center gap-2 px-8 py-4 text-[15px] font-semibold transition ${
                isActive ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <FiSettings size={16} />
            Settings
          </NavLink>
        </nav>
      </aside>
    </>
  )
}
