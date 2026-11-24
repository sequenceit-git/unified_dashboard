const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

const EXPECTED = {
  ebay: ['analytics', 'messages', 'listings', 'inventory', 'orders', 'returns-cases', 'offers', 'promotions', 'advertising', 'payouts', 'buyers'],
  // The E-commerce connector app has no Customer Service or Affiliate Seller scope: no Inbox, no Creators.
  tiktok_shop: ['analytics', 'products', 'inventory', 'orders', 'packages', 'returns-cancellations', 'promotions', 'finance', 'videos-live', 'customers'],
  temu: ['analytics', 'goods', 'inventory', 'orders', 'shipping', 'after-sales', 'price-reviews', 'promotions', 'ads', 'customers'],
}

test("each shop's section ids follow its API", () => {
  for (const [key, ids] of Object.entries(EXPECTED)) {
    assert.deepEqual(require(`../marketplaces/${key}/profile`).sections.map((s) => s.id), ids, key)
    const loaders = Object.keys(require(`../marketplaces/${key}/sections`))
    for (const id of loaders) assert.ok(ids.includes(id), `${key} section loader ${id} matches a section id`)
  }
})

test("notification links use the shop's section names", () => {
  const restore = stubModules({ '/models/Notification': {}, '/models/Product': {}, './events': { publish: async () => {} } })
  try {
    const { shopPath } = freshRequire('services/core/notify.js')
    assert.equal(shopPath('/products', 'ebay'), '/ebay/listings')
    assert.equal(shopPath('/returns', 'tiktok_shop'), '/tiktok/returns-cancellations')
    assert.equal(shopPath('/products', 'temu'), '/temu/goods')
    assert.equal(shopPath('/orders', 'temu'), '/temu/orders')
  } finally { restore() }
})

test("each shop's API uses its section names", () => {
  const routes = (key) => require(`../marketplaces/${key}`).app.api.routeList
  assert.ok(routes('ebay').includes('GET /listings/') && !routes('ebay').some((r) => r.includes(' /products')))
  assert.ok(routes('ebay').includes('GET /buyers/') && routes('ebay').some((r) => r.startsWith('GET /messages/')))
  assert.ok(routes('temu').includes('GET /goods/'))
  assert.ok(!routes('tiktok_shop').some((r) => r.includes('/customer-service') || r.includes('/inbox') || r.includes('/ai-reply')))
})
