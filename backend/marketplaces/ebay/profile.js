/** eBay in the dashboard: sidebar sections (each with a read-only access probe), statuses, product form, listing actions. */
const ebayConfig = require('./config')
const { ebayFetch } = require('./client')

/** Probe call: resolves true when eBay answers 2xx, throws eBay's message otherwise. */
async function ebayRest(token, url, options) {
  await ebayFetch(token, url, options)
  return true
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

const ebayListings = (token) => ebayTrading(token, 'GetMyeBaySelling', '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>1</EntriesPerPage></Pagination></ActiveList>')

const ebayOrders = (token) => ebayRest(token, '/sell/fulfillment/v1/order?limit=1')

module.exports = {
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
    { id: 'finances', label: 'Payouts', path: '/shop/finances', route: 'analytics', needs: 'sell.finances scope', probe: (t) => ebayRest(t, `${ebayConfig.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com'}/sell/finances/v1/payout?limit=1`) },
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
    subtitleMax: 55,
    maxImages: 12,
    condition: true,
    conditionDescription: true,
    variants: true,
    bestOffer: true,
    dispatchTime: true,
    mpn: true,
    specifics: { label: 'Item specifics', hint: 'eBay asks for different specifics per category. Brand is always sent.' },
    packageDetails: { required: false, note: 'Used by eBay for calculated shipping.' },
    productStatus: { draft: 'Draft', active: 'Ready to list', archived: 'Archived' },
    listAction: 'List on eBay',
    directIntro: 'eBay listing format: 80-character title, optional subtitle, condition & details, variations, category specifics, identifiers, Best Offer, and handling time.',
  },
  listingActions: [
    { id: 'end', label: 'End listing', danger: true, confirm: 'End this listing on eBay? Buyers will no longer see it.', statuses: ['live', 'out_of_stock'] },
    { id: 'relist', label: 'Relist on eBay', confirm: 'Put this item back on sale on eBay?', statuses: ['ended', 'paused'] },
  ],
}
