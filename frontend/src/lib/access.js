import { SHOPS } from '../marketplaces'

export const PLATFORM_ROUTES = [
  ['dashboard', 'Overview', 'Global performance metrics, store status, and top sales trends'],
  ['market-research', 'Product Discovery', 'Market research, competitor tracking, and winning item discovery'],
]

export const SHOP_ROUTES = [
  ['products', 'Listings & Catalog', 'Product listings, SKU pricing, promotions, and price reviews'],
  ['inventory', 'Inventory Management', 'Warehouse stock levels and stock adjustments'],
  ['orders', 'Orders & Fulfillment', 'Customer orders, package dispatch tracking, and return/refund claims'],
  ['customers', 'Customers & Buyers', 'Buyer database, purchase history, and shipping contact details'],
  ['inbox', 'Unified Inbox', 'Customer messages, buyer inquiries, and conversation history'],
  ['analytics', 'Analytics & Finances', 'Sales performance, revenue trends, video metrics, and payout statements'],
]

export const ROUTE_LABELS = Object.fromEntries([
  ...PLATFORM_ROUTES.map(([k, l]) => [k, l]),
  ...SHOP_ROUTES.map(([k, l]) => [k, l]),
])

/** Each shop's sidebar subsections, from its folder (src/marketplaces/<key>/index.js). */
export const MARKETPLACE_SUBSECTIONS = Object.fromEntries(SHOPS.map((shop) => [shop.key, shop.subsections]))

export const SUBSECTION_LABELS = {
  products: 'Listings / Products / Goods',
  inventory: 'Inventory',
  orders: 'Orders',
  returns: 'Returns & Cases',
  offers: 'Best Offers',
  promotions: 'Promotions',
  finances: 'Payouts & Finance',
  content: 'Videos & LIVE',
  creators: 'Creators',
  fulfillment: 'Shipping & Packages',
  prices: 'Price Reviews',
  ads: 'Ads',
  customers: 'Customers & Buyers',
  inbox: 'Unified Inbox',
  analytics: 'Analytics',
}
