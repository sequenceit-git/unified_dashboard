/**
 * Temu in the dashboard: sidebar subsections, section actions, colours and the shop-specific
 * choices shared pages make (approve-only returns, no listing from the dashboard).
 */
import returns from './sections/returns'
import { FiTag } from 'react-icons/fi'

export default {
  key: 'temu',
  label: 'Temu Shop',
  shortLabel: 'Temu Shop',
  urlId: 'temu',
  /** Sidebar icon. */
  icon: FiTag,
  badgeColor: 'yellow',
  subsections: [
    { id: 'products', route: 'products', label: 'Goods', desc: 'Goods catalog, Temu seller center sync, and listing status' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Warehouse inventory and stock level tracking' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'Temu customer orders and dispatch processing' },
    { id: 'fulfillment', route: 'orders', label: 'Shipping', desc: 'Warehouse dispatch and logistics fulfillment' },
    { id: 'returns', route: 'orders', label: 'Returns & refunds', desc: 'After-sales return management, refund disputes, and claims' },
    { id: 'prices', route: 'products', label: 'Price reviews', desc: 'Temu price order requests, discount agreements, and price margin review' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Temu promotion activities and the ones your goods joined' },
    { id: 'ads', route: 'analytics', label: 'Ads', desc: 'Temu ad spend, sales, and ROAS by goods' },
    { id: 'customers', route: 'customers', label: 'Customers', desc: 'Buyer order records and customer transaction details' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Order analytics, revenue volume, and store sales trends' },
  ],
  sections: { returns },
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
