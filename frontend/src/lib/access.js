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

export const MARKETPLACE_SUBSECTIONS = {
  ebay: [
    { id: 'products', route: 'products', label: 'Listings', desc: 'Product listings, item specifics, and price management' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Warehouse stock levels and stock adjustments' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'Customer purchases and order fulfillment tracking' },
    { id: 'returns', route: 'orders', label: 'Returns & cases', desc: 'Post-order return requests, disputes, and buyer inquiries' },
    { id: 'offers', route: 'products', label: 'Best offers', desc: 'Review buyer offers and send direct discount offers' },
    { id: 'promotions', route: 'products', label: 'Promotions', desc: 'Marketing promotions, markdown sales, and store discounts' },
    { id: 'finances', route: 'analytics', label: 'Payouts', desc: 'Payout records, transaction statements, and eBay processing fees' },
    { id: 'customers', route: 'customers', label: 'Buyers', desc: 'Buyer contacts, order frequency, and customer communication' },
    { id: 'inbox', route: 'inbox', label: 'Unified Inbox', desc: 'Member-to-member messages and conversation history' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Sales analytics, traffic metrics, and listing performance' },
  ],
  tiktok_shop: [
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
  temu: [
    { id: 'products', route: 'products', label: 'Goods', desc: 'Goods catalog, Temu seller center sync, and listing status' },
    { id: 'inventory', route: 'inventory', label: 'Inventory', desc: 'Warehouse inventory and stock level tracking' },
    { id: 'orders', route: 'orders', label: 'Orders', desc: 'Temu customer orders and dispatch processing' },
    { id: 'fulfillment', route: 'orders', label: 'Shipping', desc: 'Warehouse dispatch and logistics fulfillment' },
    { id: 'returns', route: 'orders', label: 'Returns & refunds', desc: 'After-sales return management, refund disputes, and claims' },
    { id: 'prices', route: 'products', label: 'Price reviews', desc: 'Temu price order requests, discount agreements, and price margin review' },
    { id: 'customers', route: 'customers', label: 'Customers', desc: 'Buyer order records and customer transaction details' },
    { id: 'analytics', route: 'analytics', label: 'Analytics', desc: 'Order analytics, revenue volume, and store sales trends' },
  ],
}

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
  customers: 'Customers & Buyers',
  inbox: 'Unified Inbox',
  analytics: 'Analytics',
}
