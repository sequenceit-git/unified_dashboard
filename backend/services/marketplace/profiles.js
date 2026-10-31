/**
 * What each shop looks like in the dashboard: its sidebar sections, its own status names and
 * its product form. Every section has a read-only `probe` against the API it needs, so a shop
 * only shows sections its token can actually reach (see `checkAccess`).
 */

const ebayConfig = require('../../config/marketplaces').ebay
const tiktok = require('./tiktok')
const temu = require('./temu')

async function ebayRest(token, url, { iaf = false, headers = {} } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${ebayConfig.apiBaseUrl}${url}`, {
    headers: {
      Authorization: iaf ? `IAF ${token}` : `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      ...headers,
    },
  })
  if (res.ok) return true
  const body = await res.json().catch(() => ({}))
  throw new Error(body.errors?.[0]?.message || `eBay returned ${res.status}`)
}

async function ebayTrading(token, call, inner = '') {
  const res = await fetch(`${ebayConfig.apiBaseUrl}/ws/api.dll`, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${inner}</${call}Request>`,
  })
  const xml = await res.text()
  if (/<Ack>(Success|Warning)<\/Ack>/.test(xml)) return true
  throw new Error(xml.match(/<LongMessage>([^<]+)/)?.[1] || `eBay ${call} failed`)
}

const ttCall = (method, path, opts = {}) => (token, shop) => tiktok.call(token, method, path, { shop, ...opts })
const ttDates = () => {
  const to = new Date()
  const from = new Date(to - 7 * 86400000)
  return { start_date_ge: from.toISOString().slice(0, 10), end_date_lt: to.toISOString().slice(0, 10) }
}

const ebayListings = (token) => ebayTrading(token, 'GetMyeBaySelling', '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>1</EntriesPerPage></Pagination></ActiveList>')
const ebayOrders = (token) => ebayRest(token, '/sell/fulfillment/v1/order?limit=1')
const ttProducts = ttCall('POST', '/product/202309/products/search', { query: { page_size: 1 }, body: {} })
const ttOrders = ttCall('POST', '/order/202309/orders/search', { query: { page_size: 1 }, body: {} })
const temuGoods = (token) => temu.call('bg.local.goods.list.query', { access_token: token, pageNo: 1, pageSize: 1, goodsSearchType: 1 })
const temuOrders = (token) => temu.call('bg.order.list.v2.get', { access_token: token, pageNumber: 1, pageSize: 1 })

/**
 * `route` is the permission a sub-admin needs (Settings > Sub-admins); `path` is the page.
 * `needs` names the API or scope, shown when the section is unavailable.
 */
const PROFILES = {
  ebay: {
    label: 'eBay',
    sections: [
      { id: 'analytics', label: 'Analytics', path: '/analytics', route: 'analytics', needs: 'Sell Fulfillment API', probe: ebayOrders },
      { id: 'inbox', label: 'Inbox', path: '/inbox', route: 'inbox', needs: 'commerce.message scope', probe: (t) => ebayRest(t, '/commerce/message/v1/conversation?conversation_type=FROM_MEMBERS&limit=1') },
      { id: 'products', label: 'Listings', path: '/products', route: 'products', needs: 'Trading API', probe: ebayListings },
      { id: 'inventory', label: 'Inventory', path: '/inventory', route: 'inventory', needs: 'Trading API', probe: ebayListings },
      { id: 'orders', label: 'Orders', path: '/orders', route: 'orders', needs: 'sell.fulfillment scope', probe: ebayOrders },
      { id: 'returns', label: 'Returns & cases', path: '/shop/returns', route: 'orders', needs: 'Post-Order API', probe: (t) => ebayRest(t, '/post-order/v2/return/search?limit=1', { iaf: true }) },
      { id: 'offers', label: 'Best offers', path: '/shop/offers', route: 'products', needs: 'Negotiation API', probe: (t) => ebayRest(t, '/sell/negotiation/v1/find_eligible_items?limit=1') },
      { id: 'promotions', label: 'Promotions', path: '/shop/promotions', route: 'products', needs: 'sell.marketing scope', probe: (t) => ebayRest(t, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=1') },
      { id: 'finances', label: 'Payouts', path: '/shop/finances', route: 'analytics', needs: 'sell.finances scope', probe: (t) => ebayRest(t, 'https://apiz.ebay.com/sell/finances/v1/payout?limit=1') },
      { id: 'customers', label: 'Buyers', path: '/customers', route: 'customers', needs: 'sell.fulfillment scope', probe: ebayOrders },
    ],
    statuses: {
      live: { label: 'Active', color: 'green' },
      out_of_stock: { label: 'Out of stock', color: 'yellow' },
      pending: { label: 'Pending', color: 'blue' },
      paused: { label: 'Unsold', color: 'gray' },
      ended: { label: 'Ended', color: 'gray' },
      error: { label: 'Not listed', color: 'red' },
    },
    rawStatuses: {},
    productForm: {
      titleMax: 80,
      maxImages: 12,
      condition: true,
      specifics: { label: 'Item specifics', hint: 'eBay asks for different specifics per category. Brand is always sent.' },
      packageDetails: { required: false, note: 'Used by eBay for calculated shipping.' },
      productStatus: { draft: 'Draft', active: 'Ready to list', archived: 'Archived' },
      listAction: 'List on eBay',
      directIntro: 'eBay listing format: 80-character title, condition, category, and item specifics.',
    },
    listingActions: [
      { id: 'end', label: 'End listing', confirm: 'End this listing on eBay? Buyers will no longer see it.', statuses: ['live', 'out_of_stock'] },
      { id: 'relist', label: 'Relist', confirm: 'Put this item back on eBay?', statuses: ['ended'] },
    ],
  },

  tiktok_shop: {
    label: 'TikTok Shop',
    sections: [
      { id: 'analytics', label: 'Analytics', path: '/analytics', route: 'analytics', needs: 'Data Analytics API', probe: ttCall('GET', '/analytics/202405/shop/performance', { query: ttDates() }) },
      { id: 'inbox', label: 'Inbox', path: '/inbox', route: 'inbox', needs: 'Customer Service scope', probe: ttCall('GET', '/customer_service/202309/conversations', { query: { page_size: 1 } }) },
      { id: 'products', label: 'Products', path: '/products', route: 'products', needs: 'Product API', probe: ttProducts },
      { id: 'inventory', label: 'Inventory', path: '/inventory', route: 'inventory', needs: 'Product API', probe: ttProducts },
      { id: 'orders', label: 'Orders', path: '/orders', route: 'orders', needs: 'Order API', probe: ttOrders },
      { id: 'fulfillment', label: 'Packages', path: '/shop/fulfillment', route: 'orders', needs: 'Fulfillment API', probe: ttCall('POST', '/fulfillment/202309/packages/search', { query: { page_size: 1 }, body: {} }) },
      { id: 'returns', label: 'Returns & cancellations', path: '/shop/returns', route: 'orders', needs: 'Return and Refund API', probe: ttCall('POST', '/return_refund/202309/returns/search', { query: { page_size: 1 }, body: {} }) },
      { id: 'promotions', label: 'Promotions', path: '/shop/promotions', route: 'products', needs: 'Promotion API', probe: ttCall('POST', '/promotion/202309/activities/search', { body: { page_size: 1 } }) },
      { id: 'finances', label: 'Finance', path: '/shop/finances', route: 'analytics', needs: 'Finance API', probe: ttCall('GET', '/finance/202309/statements', { query: { page_size: 1, sort_field: 'statement_time' } }) },
      { id: 'content', label: 'Videos & LIVE', path: '/shop/content', route: 'analytics', needs: 'Data Analytics API', probe: ttCall('GET', '/analytics/202409/shop_videos/performance', { query: { ...ttDates(), page_size: 1 } }) },
      { id: 'creators', label: 'Creators', path: '/shop/creators', route: 'products', needs: 'Affiliate Seller scope', probe: ttCall('POST', '/affiliate_seller/202406/marketplace_creators/search', { query: { page_size: 12 }, body: {} }) },
      { id: 'customers', label: 'Customers', path: '/customers', route: 'customers', needs: 'Order API', probe: ttOrders },
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
      specifics: { label: 'Product attributes', hint: 'TikTok asks for attributes per category, matched when you list.' },
      packageDetails: { required: true, note: 'TikTok needs package weight and size to make shipping labels.' },
      productStatus: { draft: 'Draft', active: 'Ready to publish', archived: 'Archived' },
      listAction: 'Publish to TikTok Shop',
      directIntro: 'TikTok Shop format: longer title, required package size, and category attributes. New products go to review.',
    },
    listingActions: [
      { id: 'unpublish', label: 'Unpublish', confirm: 'Take this product off TikTok Shop? You can publish it again later.', statuses: ['live', 'out_of_stock'], raw: ['ACTIVATE'] },
      { id: 'publish', label: 'Publish', confirm: 'Publish this product on TikTok Shop? A draft goes to review first.', statuses: ['paused', 'error'], raw: ['SELLER_DEACTIVATED', 'PLATFORM_DEACTIVATED', 'DRAFT', 'FAILED'] },
      { id: 'delete', label: 'Cancel review', danger: true, confirm: 'Cancel this TikTok Shop review and delete the listing?', statuses: ['pending'], raw: ['PENDING'] },
      { id: 'delete', label: 'Delete listing', danger: true, confirm: 'Delete this product from TikTok Shop? This cannot be undone.', statuses: ['paused', 'error'], raw: ['DRAFT', 'FAILED'] },
    ],
  },

  temu: {
    label: 'Temu Shop',
    sections: [
      { id: 'analytics', label: 'Analytics', path: '/analytics', route: 'analytics', needs: 'bg.order.list.v2.get', probe: temuOrders },
      { id: 'products', label: 'Goods', path: '/products', route: 'products', needs: 'bg.local.goods.list.query', probe: temuGoods },
      { id: 'inventory', label: 'Inventory', path: '/inventory', route: 'inventory', needs: 'bg.local.goods.list.query', probe: temuGoods },
      { id: 'orders', label: 'Orders', path: '/orders', route: 'orders', needs: 'bg.order.list.v2.get', probe: temuOrders },
      { id: 'customers', label: 'Customers', path: '/customers', route: 'customers', needs: 'bg.order.list.v2.get', probe: temuOrders },
    ],
    statuses: {
      live: { label: 'On sale', color: 'green' },
      out_of_stock: { label: 'Sold out', color: 'yellow' },
      pending: { label: 'Under review', color: 'blue' },
      paused: { label: 'Off sale', color: 'gray' },
      ended: { label: 'Removed', color: 'gray' },
      error: { label: 'Rejected', color: 'red' },
    },
    rawStatuses: {},
    productForm: {
      titleMax: 250,
      maxImages: 10,
      condition: false,
      specifics: null,
      packageDetails: { required: false, note: '' },
      productStatus: { draft: 'Draft', active: 'Ready', archived: 'Archived' },
      listAction: 'List on Temu',
      directIntro: 'Save goods to the catalog. Publishing to Temu from EcomPilot is not available yet.',
    },
    listingActions: [],
  },
}

const ACCESS_TTL_MS = 12 * 60 * 60 * 1000

/** Runs every section probe at once; returns `{ [sectionId]: { ok, reason } }`. */
async function probeSections(marketplace, token, shop) {
  const profile = PROFILES[marketplace]
  const results = await Promise.all(profile.sections.map(async (section) => {
    try {
      await section.probe(token, shop)
      return [section.id, { ok: true }]
    } catch (err) {
      const denied = /access denied|scope|not been granted|insufficient|401|403/i.test(err.message || '')
      return [section.id, { ok: !denied, reason: denied ? `Needs ${section.needs}` : '', error: denied ? '' : String(err.message || '').slice(0, 200) }]
    }
  }))
  return Object.fromEntries(results)
}

/** Public view of a profile for one shop, with each section's availability. */
function describe(marketplace, shop) {
  const profile = PROFILES[marketplace]
  if (!profile) return null
  const access = shop?.apiAccess || {}
  return {
    marketplace,
    label: profile.label,
    connected: shop?.status === 'connected',
    accessCheckedAt: shop?.apiAccessCheckedAt || null,
    sections: profile.sections.map(({ probe, ...section }) => {
      const result = access[section.id]
      const available = !shop || shop.status !== 'connected' ? null : result ? result.ok : null
      return { ...section, available, reason: result?.reason || '' }
    }),
    statuses: profile.statuses,
    rawStatuses: profile.rawStatuses,
    productForm: profile.productForm,
    listingActions: profile.listingActions || [],
  }
}

module.exports = { PROFILES, ACCESS_TTL_MS, probeSections, describe }
