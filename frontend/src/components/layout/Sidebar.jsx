import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  FiChevronDown,
  FiSettings,
  FiCompass,
  FiHome,
  FiShoppingBag,
  FiMusic,
  FiTag,
  FiBarChart2,
  FiInbox,
  FiPackage,
  FiLayers,
  FiShoppingCart,
  FiUsers,
  FiShield,
} from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import { allowedShopSections } from '../../hooks/useShopSection'

const TOP_LINKS = [
  { to: '/market-research', label: 'Product Discovery', route: 'market-research', icon: FiCompass },
  { to: '/', label: 'Overview', route: 'dashboard', end: true, icon: FiHome },
]

const SHOP_SECTIONS = [
  {
    id: 'ebay',
    label: 'eBay',
    icon: FiShoppingBag,
    storageKey: 'sidebar-ebay-open',
    defaultOpen: true,
  },
  {
    id: 'tiktok',
    label: 'TikTok Shop',
    icon: FiMusic,
    storageKey: 'sidebar-tiktok-open',
    defaultOpen: false,
  },
  {
    id: 'temu',
    label: 'Temu Shop',
    icon: FiTag,
    storageKey: 'sidebar-temu-open',
    defaultOpen: false,
  },
]

const SHOP_LINKS = [
  { path: '/analytics', label: 'Analytics', route: 'analytics', icon: FiBarChart2 },
  { path: '/inbox', label: 'Inbox', route: 'inbox', icon: FiInbox },
  { path: '/products', label: 'Products', route: 'products', icon: FiPackage },
  { path: '/inventory', label: 'Inventory', route: 'inventory', icon: FiLayers },
  { path: '/orders', label: 'Orders', route: 'orders', icon: FiShoppingCart },
  { path: '/customers', label: 'Customers', route: 'customers', icon: FiUsers },
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
  return `flex w-full items-center gap-3 text-[15px] font-semibold transition-colors lg:gap-0 lg:justify-center lg:group-hover:justify-start lg:group-hover:gap-3 ${
    nested
      ? 'py-3 pl-14 pr-6 lg:px-0 lg:group-hover:pl-14 lg:group-hover:pr-6'
      : 'px-8 py-4 lg:px-0 lg:group-hover:px-8'
  } ${on ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
}

function ItemLabel({ children }) {
  return (
    <span className="min-w-0 truncate text-left transition-all duration-200 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[180px] lg:group-hover:opacity-100">
      {children}
    </span>
  )
}

function NavItem({ to, end, onClose, nested, active, icon: Icon, children }) {
  const label = typeof children === 'string' ? children : undefined
  const content = (
    <>
      {Icon && <Icon size={18} className="shrink-0" />}
      <ItemLabel>{children}</ItemLabel>
    </>
  )

  if (active !== undefined) {
    return (
      <Link
        to={to}
        onClick={onClose}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={itemClass(nested, active)}
      >
        {content}
      </Link>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      title={label}
      aria-label={label}
      className={({ isActive }) => itemClass(nested, isActive)}
    >
      {content}
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
  const Icon = section.icon

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
        title={section.label}
        aria-label={section.label}
        aria-expanded={open}
        aria-controls={`${section.id}-shop-nav`}
        className={`flex w-full items-center gap-3 px-8 py-3 text-left transition-colors hover:bg-slate-100 lg:gap-0 lg:justify-center lg:px-0 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-8 ${
          !open && active ? 'bg-indigo-50' : ''
        }`}
      >
        <Icon size={18} className="shrink-0 text-slate-500" />
        <ItemLabel>{section.label}</ItemLabel>
        <FiChevronDown
          size={16}
          className={`ml-auto shrink-0 text-slate-400 transition-transform lg:ml-0 lg:w-0 lg:opacity-0 lg:group-hover:ml-auto lg:group-hover:w-4 lg:group-hover:opacity-100 ${
            open ? '' : '-rotate-90'
          }`}
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
              icon={link.icon}
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
  const { hasRoute, isAdmin, user } = useAuth()
  const { pathname, search } = useLocation()
  const topLinks = TOP_LINKS.filter((link) => hasRoute(link.route))
  const allowedShopIds = new Set(allowedShopSections(user, isAdmin).map((section) => section.id))
  const shopSections = SHOP_SECTIONS.filter((section) => allowedShopIds.has(section.id)).map((section) => ({
    ...section,
    links: SHOP_LINKS.filter((link) => hasRoute(link.route)).map((link) => ({
      ...link,
      shop: section.id,
      to: `${link.path}?shop=${section.id}`,
    })),
  })).filter((section) => section.links.length > 0)

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={`group fixed bottom-0 left-0 top-16 z-40 w-64 transform overflow-x-hidden border-r border-[#E2E8F0] bg-white p-0 text-[#0F172A] shadow-2xl transition-[transform,width] duration-200 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-[72px] lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:hover:w-64 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full w-full overflow-y-auto overflow-x-hidden pt-6">
          {topLinks.map((link) => (
            <NavItem
              key={link.to}
              to={link.to}
              end={link.end}
              onClose={onClose}
              icon={link.icon}
            >
              {link.label}
            </NavItem>
          ))}

          {shopSections.length > 0 && (
            <div className="mt-2">
              <p className="overflow-hidden px-8 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 transition-all duration-200 lg:max-h-0 lg:px-0 lg:pb-0 lg:pt-0 lg:opacity-0 lg:group-hover:max-h-10 lg:group-hover:px-8 lg:group-hover:pb-1 lg:group-hover:pt-5 lg:group-hover:opacity-100">
                Shop
              </p>
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

          {isAdmin && (
            <NavItem to="/sub-admins" onClose={onClose} icon={FiShield}>
              Sub-admins
            </NavItem>
          )}

          <NavItem to="/settings" onClose={onClose} icon={FiSettings}>
            Settings
          </NavItem>
        </nav>
      </aside>
    </>
  )
}
