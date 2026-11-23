/**
 * TikTok Shop in the dashboard: its pages (sections/<section>/), sidebar subsections, colours and
 * the settings its pages and the shared screens read (promotions, live updates, listing defaults).
 */
import { lazy } from 'react'
import { FiMusic } from 'react-icons/fi'

export default {
  key: 'tiktok_shop',
  label: 'TikTok Shop',
  shortLabel: 'TikTok Shop',
  urlId: 'tiktok',
  /** Sidebar icon. */
  icon: FiMusic,
  /** Name on the Product Discovery run form. */
  researchLabel: 'TikTok Shop',
  badgeColor: 'purple',
  /** Section ids renamed to this shop's own API names (old → new): old URLs redirect. */
  renamedSections: { fulfillment: 'packages', finances: 'finance', content: 'videos-live', returns: 'returns-cancellations', inbox: 'customer-service' },
  /** This shop's pages, by section id (loaded on first visit): routes are /<urlId>/<section>. */
  pages: {
    analytics: lazy(() => import('./sections/analytics/AnalyticsPage')),
    'customer-service': lazy(() => import('./sections/customer-service/CustomerServicePage')),
    products: lazy(() => import('./sections/products/ProductsPage')),
    inventory: lazy(() => import('./sections/inventory/InventoryPage')),
    orders: lazy(() => import('./sections/orders/OrdersPage')),
    packages: lazy(() => import('./sections/packages/PackagesPage')),
    'returns-cancellations': lazy(() => import('./sections/returns-cancellations/ReturnsCancellationsPage')),
    promotions: lazy(() => import('./sections/promotions/PromotionsPage')),
    finance: lazy(() => import('./sections/finance/FinancePage')),
    'videos-live': lazy(() => import('./sections/videos-live/VideosLivePage')),
    creators: lazy(() => import('./sections/creators/CreatorsPage')),
    customers: lazy(() => import('./sections/customers/CustomersPage')),
  },
  /** List dialog, also opened from Market research. */
  ListModal: lazy(() => import('./sections/products/ListModal')),
  subsections: [
    { id: 'products', route: 'products', label: 'Products', desc: 'Live product catalog, review status, and direct listing' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Real-time SKU stock levels and multi-warehouse inventory' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'TikTok Shop orders, buyer checkout, and order status' },
    { id: 'packages', route: 'orders', label: 'Packages', desc: 'Package dispatch, shipping label generation, and logistics tracking' },
    { id: 'returns-cancellations', route: 'orders', label: 'Returns & cancellations', desc: 'Return requests, buyer refund claims, and cancellation review' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Promotional campaigns, flash sales, and product discounts' },
    { id: 'finance', route: 'analytics', label: 'Finance', desc: 'Settlement statements, platform fees, and finance disbursement' },
    { id: 'videos-live', route: 'analytics', label: 'Videos & LIVE', desc: 'Shoppable video analytics, livestream performance, and GMV' },
    { id: 'creators', route: 'products', label: 'Creators', desc: 'Affiliate marketplace creators and collaboration invites' },
    { id: 'customers', route: 'customers', label: 'Customers', desc: 'TikTok customer purchase history and profile records' },
    { id: 'customer-service', route: 'inbox', label: 'Unified Inbox', desc: 'Customer service chat, buyer messaging, and rapid responses' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Shop performance, video metrics, revenue analysis, and conversions' },
  ],
  theme: {
    storeLabel: 'TikTok Shop',
    shopName: 'TikTok Shop (Scentro)',
    desc: 'Manage live products, package fulfillment, creator affiliates, video analytics & finance.',
    border: 'border-rose-500',
    bgActive: 'bg-rose-50/80 dark:bg-rose-950/30',
    subAdminLabel: 'TikTok Shop Sub-Admin',
    adminsLabel: 'TikTok Shop',
    tabLabel: 'TikTok',
    pill: 'rose',
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    indicator: 'bg-rose-500',
    card: 'border-rose-500 bg-rose-50/60 shadow-xs dark:bg-rose-950/30',
    count: 'text-rose-600 dark:text-rose-400',
    tab: 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400',
  },
  promotions: { canCreate: true, pauseVerb: 'Deactivate' },
  liveUpdates: { pushes: 'sales and messages', arrives: 'sales and messages' },
  shipNeedsTracking: true,
  listingDefaults: {
    variants: true,
    brands: true,
    sizeChart: true,
    identifierCode: true,
    listPrice: true,
    saveModes: ['LISTING', 'AS_DRAFT'],
    listAction: 'Publish to TikTok Shop',
  },
}
