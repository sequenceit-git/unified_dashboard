/**
 * eBay in the dashboard: its pages (sections/<section>/), sidebar subsections, colours and
 * the settings its pages and the shared screens read (promotions, live updates, listing defaults).
 */
import Wordmark from './Wordmark'
import { lazy } from 'react'
import { FiShoppingBag } from 'react-icons/fi'

export default {
  key: 'ebay',
  label: 'eBay',
  shortLabel: 'eBay',
  urlId: 'ebay',
  /** Sidebar icon. */
  icon: FiShoppingBag,
  /** Name on the Product Discovery run form. */
  researchLabel: 'eBay',
  badgeColor: 'blue',
  Wordmark,
  /** Section ids renamed to this shop's own API names (old → new): old URLs redirect. */
  renamedSections: { products: 'listings', finances: 'payouts', customers: 'buyers', returns: 'returns-cases', inbox: 'messages' },
  /** This shop's pages, by section id (loaded on first visit): routes are /<urlId>/<section>. */
  pages: {
    analytics: lazy(() => import('./sections/analytics/AnalyticsPage')),
    messages: lazy(() => import('./sections/messages/MessagesPage')),
    listings: lazy(() => import('./sections/listings/ListingsPage')),
    inventory: lazy(() => import('./sections/inventory/InventoryPage')),
    orders: lazy(() => import('./sections/orders/OrdersPage')),
    'returns-cases': lazy(() => import('./sections/returns-cases/ReturnsCasesPage')),
    offers: lazy(() => import('./sections/offers/OffersPage')),
    promotions: lazy(() => import('./sections/promotions/PromotionsPage')),
    advertising: lazy(() => import('./sections/advertising/AdvertisingPage')),
    payouts: lazy(() => import('./sections/payouts/PayoutsPage')),
    buyers: lazy(() => import('./sections/buyers/BuyersPage')),
  },
  /** List dialog, also opened from Market research. */
  ListModal: lazy(() => import('./sections/listings/ListModal')),
  subsections: [
    { id: 'listings', route: 'products', label: 'Listings', desc: 'Product listings, item specifics, and price management' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Warehouse stock levels and stock adjustments' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'Customer purchases and order fulfillment tracking' },
    { id: 'returns-cases', route: 'orders', label: 'Returns & cases', desc: 'Post-order return requests, disputes, and buyer inquiries' },
    { id: 'offers', route: 'products', label: 'Best offers', desc: 'Review buyer offers and send direct discount offers' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Marketing promotions, markdown sales, and store discounts' },
    { id: 'advertising', route: 'products', label: 'Promoted Listings', desc: 'Ad campaigns, ad rates and ad results' },
    { id: 'payouts', route: 'analytics', label: 'Payouts', desc: 'Payout records, transaction statements, and eBay processing fees' },
    { id: 'buyers', route: 'customers', label: 'Buyers', desc: 'Buyer contacts, order frequency, and customer communication' },
    { id: 'messages', route: 'inbox', label: 'Unified Inbox', desc: 'Member-to-member messages and conversation history' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Sales analytics, traffic metrics, and listing performance' },
  ],
  theme: {
    storeLabel: 'eBay Store',
    shopName: 'eBay Store',
    desc: 'Manage listings, buyer offers, orders, disputes, cases, payouts & messaging.',
    border: 'border-blue-500',
    bgActive: 'bg-blue-50/80 dark:bg-blue-950/30',
    subAdminLabel: 'eBay Sub-Admin',
    adminsLabel: 'eBay Admins',
    tabLabel: 'eBay',
    pill: 'blue',
    badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    indicator: 'bg-blue-500',
    card: 'border-blue-500 bg-blue-50/60 shadow-xs dark:bg-blue-950/30',
    count: 'text-blue-600 dark:text-blue-400',
    tab: 'bg-white text-blue-700 shadow-xs dark:bg-slate-800 dark:text-blue-400',
  },
  promotions: {
    canCreate: true,
    pauseVerb: 'Pause',
    form: {
      minPercent: '5',
      idsLabel: 'eBay item IDs',
      idsPlaceholder: 'Leave blank for all live listings, or comma-separated eBay item IDs',
      idsHint: 'eBay sale (markdown): 5–80% off, at least 24 hours. Leave blank to include all live eBay listings (up to 500).',
    },
  },
  cancellations: { rejectNeedsTracking: true },
  liveUpdates: { pushes: 'sales and messages', arrives: 'sales and messages' },
  shipNeedsTracking: true,
  listingDefaults: {
    conditionDescription: true,
    variants: true,
    identifierCode: true,
    bestOffer: true,
    dispatchTime: true,
    mpn: true,
  },
  buyer: {
    email: (username) => `${username.toLowerCase()}@members.ebay.com`,
    profileUrl: (username) => `https://www.ebay.com/usr/${encodeURIComponent(username)}`,
  },
}
