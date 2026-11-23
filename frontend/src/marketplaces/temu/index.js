/**
 * Temu in the dashboard: its pages (sections/<section>/), sidebar subsections, colours and
 * the settings its pages and the shared screens read (promotions, live updates, listing defaults).
 */
import { lazy } from 'react'
import { FiTag } from 'react-icons/fi'

export default {
  key: 'temu',
  label: 'Temu Shop',
  shortLabel: 'Temu Shop',
  urlId: 'temu',
  /** Sidebar icon. */
  icon: FiTag,
  /** Name on the Product Discovery run form. */
  researchLabel: 'Temu',
  badgeColor: 'yellow',
  /** Section ids renamed to this shop's own API names (old → new): old URLs redirect. */
  renamedSections: { products: 'goods', fulfillment: 'shipping', prices: 'price-reviews', returns: 'after-sales' },
  /** This shop's pages, by section id (loaded on first visit): routes are /<urlId>/<section>. */
  pages: {
    analytics: lazy(() => import('./sections/analytics/AnalyticsPage')),
    goods: lazy(() => import('./sections/goods/GoodsPage')),
    inventory: lazy(() => import('./sections/inventory/InventoryPage')),
    orders: lazy(() => import('./sections/orders/OrdersPage')),
    shipping: lazy(() => import('./sections/shipping/ShippingPage')),
    'after-sales': lazy(() => import('./sections/after-sales/AfterSalesPage')),
    'price-reviews': lazy(() => import('./sections/price-reviews/PriceReviewsPage')),
    promotions: lazy(() => import('./sections/promotions/PromotionsPage')),
    ads: lazy(() => import('./sections/ads/AdsPage')),
    customers: lazy(() => import('./sections/customers/CustomersPage')),
  },
  /** List dialog, also opened from Market research. */
  ListModal: lazy(() => import('./sections/goods/ListModal')),
  subsections: [
    { id: 'goods', route: 'products', label: 'Goods', desc: 'Goods catalog, Temu seller center sync, and listing status' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Warehouse inventory and stock level tracking' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'Temu customer orders and dispatch processing' },
    { id: 'shipping', route: 'orders', label: 'Shipping', desc: 'Warehouse dispatch and logistics fulfillment' },
    { id: 'after-sales', route: 'orders', label: 'Returns & refunds', desc: 'After-sales return management, refund disputes, and claims' },
    { id: 'price-reviews', route: 'products', label: 'Price reviews', desc: 'Temu price order requests, discount agreements, and price margin review' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Temu promotion activities and the ones your goods joined' },
    { id: 'ads', route: 'analytics', label: 'Ads', desc: 'Temu ad spend, sales, and ROAS by goods' },
    { id: 'customers', route: 'customers', label: 'Customers', desc: 'Buyer order records and customer transaction details' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Order analytics, revenue volume, and store sales trends' },
  ],
  theme: {
    storeLabel: 'Temu Shop',
    shopName: 'Temu Store',
    desc: 'Manage seller goods, inventory, warehouse shipping, price reviews & return claims.',
    border: 'border-amber-500',
    bgActive: 'bg-amber-50/80 dark:bg-amber-950/30',
    subAdminLabel: 'Temu Shop Sub-Admin',
    adminsLabel: 'Temu Shop',
    tabLabel: 'Temu',
    pill: 'amber',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    indicator: 'bg-amber-500',
    card: 'border-amber-500 bg-amber-50/60 shadow-xs dark:bg-amber-950/30',
    count: 'text-amber-600 dark:text-amber-400',
    tab: 'bg-white text-amber-700 shadow-xs dark:bg-slate-800 dark:text-amber-400',
  },
  liveUpdates: { pushes: 'order changes', arrives: 'orders' },
  shipNeedsTracking: true,
  listingDefaults: { canList: false },
}
