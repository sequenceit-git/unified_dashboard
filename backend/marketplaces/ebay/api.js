/**
 * eBay's dashboard API, mounted at /api/ebay: the route groups this shop has.
 * Handlers and logic are shared (routes/shop/); the shop is fixed by the URL.
 */
const { shopApi } = require('../../routes/shop')

module.exports = shopApi('ebay', ['products', 'inventory', 'orders', 'customers', 'inbox', 'analytics', 'sections', 'shops'])
