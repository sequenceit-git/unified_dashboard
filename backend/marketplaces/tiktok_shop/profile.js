/** TikTok Shop in the dashboard: sidebar sections (each with a read-only access probe), statuses, product form, listing actions. */
const tiktok = require('./service')

const ttCall = (method, path, opts = {}) => (token, shop) => tiktok.call(token, method, path, { shop, ...opts })
const ttDates = () => {
  const to = new Date()
  const from = new Date(to - 7 * 86400000)
  return { start_date_ge: from.toISOString().slice(0, 10), end_date_lt: to.toISOString().slice(0, 10) }
}
const ttProducts = ttCall('POST', '/product/202502/products/search', { query: { page_size: 1 }, body: {} })
const ttOrders = ttCall('POST', '/order/202309/orders/search', { query: { page_size: 1 }, body: {} })

module.exports = {
  label: 'TikTok Shop',
  sections: [
    { id: 'analytics', label: 'Analytics', path: '/tiktok/analytics', route: 'analytics', needs: 'Data Analytics API', probe: ttCall('GET', '/analytics/202509/shop/performance', { query: ttDates() }) },
    { id: 'products', label: 'Products', path: '/tiktok/products', route: 'products', needs: 'Product API', probe: ttProducts },
    { id: 'inventory', label: 'Inventory', path: '/tiktok/inventory', route: 'inventory', needs: 'Product API', probe: ttProducts },
    { id: 'orders', label: 'Orders', path: '/tiktok/orders', route: 'orders', needs: 'Order API', probe: ttOrders },
    { id: 'packages', label: 'Packages', path: '/tiktok/packages', route: 'orders', needs: 'Fulfillment API', probe: ttCall('POST', '/fulfillment/202309/packages/search', { query: { page_size: 1 }, body: {} }) },
    { id: 'returns-cancellations', label: 'Returns & cancellations', path: '/tiktok/returns-cancellations', route: 'orders', needs: 'Return and Refund API', probe: ttCall('POST', '/return_refund/202309/returns/search', { query: { page_size: 10 }, body: {} }) },
    { id: 'promotions', label: 'Promotions', path: '/tiktok/promotions', route: 'products', needs: 'Promotion API', probe: ttCall('POST', '/promotion/202309/activities/search', { body: { page_size: 1 } }) },
    { id: 'finance', label: 'Finance', path: '/tiktok/finance', route: 'analytics', needs: 'Finance API', probe: ttCall('GET', '/finance/202309/statements', { query: { page_size: 1, sort_field: 'statement_time' } }) },
    { id: 'videos-live', label: 'Videos & LIVE', path: '/tiktok/videos-live', route: 'analytics', needs: 'Data Analytics API', probe: ttCall('GET', '/analytics/202509/shop_videos/performance', { query: { ...ttDates(), page_size: 1 } }) },
    { id: 'customers', label: 'Customers', path: '/tiktok/customers', route: 'customers', needs: 'Order API', probe: ttOrders },
  ],
  statuses: {
    live: { label: 'Live', color: 'green' },
    out_of_stock: { label: 'Out of stock', color: 'yellow' },
    pending: { label: 'Reviewing', color: 'blue' },
    paused: { label: 'Deactivated', color: 'gray' },
    ended: { label: 'Deleted', color: 'gray' },
    error: { label: 'Failed', color: 'red' },
  },
  rawStatuses: {
    ACTIVATE: { label: 'Live', color: 'green' },
    PENDING: { label: 'Reviewing', color: 'blue' },
    DRAFT: { label: 'Draft', color: 'gray' },
    FAILED: { label: 'Failed', color: 'red' },
    SELLER_DEACTIVATED: { label: 'Deactivated', color: 'gray' },
    PLATFORM_DEACTIVATED: { label: 'Suspended by TikTok', color: 'red' },
    FREEZE: { label: 'Frozen', color: 'red' },
    DELETED: { label: 'Deleted', color: 'gray' },
  },
  productForm: {
    titleMax: 255,
    maxImages: 9,
    condition: false,
    variants: true,
    specifics: { label: 'Product attributes', hint: 'TikTok asks for attributes per category, matched when you list.' },
    packageDetails: { required: true, note: 'TikTok needs package weight and size to make shipping labels.' },
    productStatus: { draft: 'Draft', active: 'Ready to publish', archived: 'Archived' },
    listAction: 'Publish to TikTok Shop',
    directIntro: 'TikTok Shop format: title, variants, brand, category attributes, size chart, certifications, required package size, and draft or direct listing.',
  },
  listingActions: [
    { id: 'unpublish', label: 'Unpublish', confirm: 'Take this product off TikTok Shop? You can publish it again later.', statuses: ['live', 'out_of_stock'], raw: ['ACTIVATE'] },
    { id: 'publish', label: 'Publish', confirm: 'Publish this product on TikTok Shop? A draft goes to review first.', statuses: ['paused', 'error'], raw: ['SELLER_DEACTIVATED', 'DRAFT', 'FAILED'] },
    { id: 'delete', label: 'Cancel review', danger: true, confirm: 'Cancel this TikTok Shop review and delete the listing?', statuses: ['pending'], raw: ['PENDING'] },
    { id: 'delete', label: 'Delete listing', danger: true, confirm: 'Delete this product from TikTok Shop? This cannot be undone.', statuses: ['paused', 'error'], raw: ['DRAFT', 'FAILED', 'SELLER_DEACTIVATED'] },
    { id: 'recover', label: 'Recover listing', confirm: 'Restore this deleted product on TikTok Shop?', statuses: ['ended'], raw: ['DELETED'] },
  ],
}
