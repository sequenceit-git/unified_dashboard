export const PLATFORM_ROUTES = [
  ['dashboard', 'Overview'],
  ['market-research', 'Product Discovery'],
]

export const SHOP_ROUTES = [
  ['analytics', 'Analytics'],
  ['inbox', 'Inbox'],
  ['products', 'Products'],
  ['inventory', 'Inventory'],
  ['orders', 'Orders'],
  ['customers', 'Customers'],
]

export const ROUTE_LABELS = Object.fromEntries([...PLATFORM_ROUTES, ...SHOP_ROUTES])
