/**
 * Temu's dashboard API, mounted at /api/temu: the route groups this shop has. Temu has no inbox.
 * Handlers and logic are shared (routes/shop/); the shop is fixed by the URL.
 */
const { shopApi } = require('../../routes/shop')

module.exports = shopApi('temu', ['products', 'inventory', 'orders', 'customers', 'analytics', 'sections', 'shops'])
