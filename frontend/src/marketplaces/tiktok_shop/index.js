/**
 * TikTok Shop in the dashboard: sidebar subsections, section actions, colours and the
 * shop-specific choices shared pages make (promotions, listing defaults).
 */
import returns from './sections/returns'
import DraftFields from './listing/draftFields/Fields'
import ProductListPrice from './listing/productFields/ListPrice'
import ProductIdentifier from './listing/productFields/Identifier'
import ListCategory from './listing/listFields/Category'
import ListDetails from './listing/listFields/Details'
import ListSizeChart from './listing/listFields/SizeChart'
import ListCertifications from './listing/listFields/Certifications'
import ListSaveMode from './listing/listFields/SaveMode'
import { validateVariantsForTikTok } from './listing/rules'
import promotions from './sections/promotions'
import fulfillment from './sections/fulfillment'
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
  subsections: [
    { id: 'products', route: 'products', label: 'Products', desc: 'Live product catalog, review status, and direct listing' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Real-time SKU stock levels and multi-warehouse inventory' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'TikTok Shop orders, buyer checkout, and order status' },
    { id: 'fulfillment', route: 'orders', label: 'Packages', desc: 'Package dispatch, shipping label generation, and logistics tracking' },
    { id: 'returns', route: 'orders', label: 'Returns & cancellations', desc: 'Return requests, buyer refund claims, and cancellation review' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Promotional campaigns, flash sales, and product discounts' },
    { id: 'finances', route: 'analytics', label: 'Finance', desc: 'Settlement statements, platform fees, and finance disbursement' },
    { id: 'content', route: 'analytics', label: 'Videos & LIVE', desc: 'Shoppable video analytics, livestream performance, and GMV' },
    { id: 'creators', route: 'products', label: 'Creators', desc: 'Affiliate marketplace creators and collaboration invites' },
    { id: 'customers', route: 'customers', label: 'Customers', desc: 'TikTok customer purchase history and profile records' },
    { id: 'inbox', route: 'inbox', label: 'Unified Inbox', desc: 'Customer service chat, buyer messaging, and rapid responses' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Shop performance, video metrics, revenue analysis, and conversions' },
  ],
  sections: { returns, promotions, fulfillment },
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
  /** Listing form: which field set the shared listing dialogs show, and this shop's validators. */
  listing: { tiktokFields: true, validateVariants: validateVariantsForTikTok, listFields: { category: ListCategory, extraFields: ListDetails, sizeChart: ListSizeChart, certifications: ListCertifications, saveMode: ListSaveMode }, skuPrefix: 'TTS', productFields: { listPrice: ProductListPrice, identifier: ProductIdentifier }, draftFields: { fields: DraftFields } },
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
