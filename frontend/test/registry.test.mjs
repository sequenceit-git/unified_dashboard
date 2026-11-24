import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

/** React elements as plain data: the texts of buttons/spans an action cell renders. */
function texts(node) {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  return texts(node.props?.children)
}

test('KEYS and getShop (including the tiktok url id)', async () => {
  const { KEYS, getShop, marketplaceBadgeColor } = await load('/src/marketplaces/index.js')
  assert.deepEqual(KEYS, ['ebay', 'tiktok_shop', 'temu'])
  assert.equal(getShop('tiktok').key, 'tiktok_shop')
  assert.equal(getShop('amazon'), null)
  assert.deepEqual(['ebay', 'tiktok_shop', 'tiktok', 'temu', 'amazon'].map(marketplaceBadgeColor), ['blue', 'purple', 'purple', 'yellow', 'gray'])
})

test('sidebar subsections are unchanged', async () => {
  const { MARKETPLACE_SUBSECTIONS } = await load('/src/lib/access.js')
  const before = await load(process.env.ACCESS_BEFORE || '/src/lib/access.js')
  assert.deepEqual(MARKETPLACE_SUBSECTIONS, before.MARKETPLACE_SUBSECTIONS)
  assert.deepEqual(MARKETPLACE_SUBSECTIONS.temu.map((s) => s.id), ['goods', 'inventory', 'orders', 'shipping', 'after-sales', 'price-reviews', 'promotions', 'ads', 'customers', 'analytics'])
})

/** A section's action columns (src/marketplaces/<key>/sections/<id>/tableActions.jsx). */
const actions = async (key, id) => (await load(`/src/marketplaces/${key}/sections/${id}/tableActions.jsx`)).default.tableActions
// Temu's Returns & refunds page has its own buttons (temu/sections/after-sales/returnsView.js, tested in temu-returns.test.mjs).
const SECTIONS_WITH_ACTIONS = { ebay: ['returns-cases', 'offers', 'promotions'], tiktok_shop: ['returns-cancellations', 'promotions', 'packages'] }

test('section tables with actions per shop', async () => {
  const wired = async (key) => Object.fromEntries(await Promise.all(SECTIONS_WITH_ACTIONS[key].map(async (id) => [id, Object.keys(await actions(key, id)).sort()])))
  assert.deepEqual(await wired('ebay'), { 'returns-cases': ['cancellations', 'returns'], offers: ['eligible'], promotions: ['activities', 'promotions'] })
  assert.deepEqual(await wired('tiktok_shop'), { 'returns-cancellations': ['cancellations', 'returns'], promotions: ['activities', 'promotions'], packages: ['packages'] })
})

test('eBay returns: approve and decline', async () => {
  const ctx = { onAction: () => {} }
  const ebay = await actions('ebay', 'returns-cases')
  assert.deepEqual(texts(ebay.returns({ status: 'Requested' }, ctx)), ['Approve', 'Decline'])
  assert.deepEqual(texts(ebay.cancellations({ status: 'Closed' }, ctx)), ['Processed'])
})

test('promotions: eBay hides markdown sales, TikTok deactivates and cannot resume', async () => {
  const ctx = { onAction: () => {} }
  const ebay = (await actions('ebay', 'promotions')).promotions
  assert.deepEqual(texts(ebay({ promotionId: 1, status: 'Running', type: 'Markdown sale' }, ctx)), [])
  assert.deepEqual(texts(ebay({ promotionId: 1, status: 'Paused', type: 'Order discount' }, ctx)), ['Resume'])
  const tt = (await actions('tiktok_shop', 'promotions')).promotions
  assert.deepEqual(texts(tt({ promotionId: 1, status: 'Ongoing' }, ctx)), ['Deactivate'])
  assert.deepEqual(texts(tt({ promotionId: 1, status: 'Deactivated' }, ctx)), [])
})

test('listing defaults match the old per-shop checks', async () => {
  const { getShop } = await load('/src/marketplaces/index.js')
  const d = (key) => getShop(key).listingDefaults
  assert.equal(d('ebay').bestOffer && d('ebay').mpn && d('ebay').dispatchTime && d('ebay').conditionDescription, true)
  assert.equal(Boolean(d('ebay').brands || d('ebay').listPrice || d('ebay').sizeChart), false)
  assert.deepEqual(d('tiktok_shop').saveModes, ['LISTING', 'AS_DRAFT'])
  assert.equal(d('tiktok_shop').listAction, 'Publish to TikTok Shop')
  // Temu lists from the dashboard since wave 3 (its own Temu form).
  assert.equal(d('temu').canList, true)
})

const SECTION_IDS = {
  ebay: ['products', 'inventory', 'orders', 'returns', 'offers', 'promotions', 'advertising', 'finances', 'customers', 'inbox', 'analytics'].map((id) => ({ products: 'listings', finances: 'payouts', customers: 'buyers', returns: 'returns-cases', inbox: 'messages' })[id] || id),
  tiktok_shop: ['products', 'inventory', 'orders', 'fulfillment', 'returns', 'promotions', 'finances', 'content', 'customers', 'analytics'].map((id) => ({ fulfillment: 'packages', finances: 'finance', content: 'videos-live', returns: 'returns-cancellations' })[id] || id),
  temu: ['products', 'inventory', 'orders', 'fulfillment', 'returns', 'prices', 'promotions', 'ads', 'customers', 'analytics'].map((id) => ({ products: 'goods', fulfillment: 'shipping', prices: 'price-reviews', returns: 'after-sales' })[id] || id),
}

test("section folders, pages and sidebar ids use each shop's names", async () => {
  const fs = await import('node:fs')
  const { getShop } = await load('/src/marketplaces/index.js')
  for (const [key, ids] of Object.entries(SECTION_IDS)) {
    const shop = getShop(key)
    assert.deepEqual(shop.subsections.map((s) => s.id), ids, `${key} sidebar`)
    assert.deepEqual(Object.keys(shop.pages).sort(), [...ids].sort(), `${key} pages`)
    assert.deepEqual(fs.readdirSync(new URL(`../src/marketplaces/${key}/sections/`, import.meta.url)).sort(), [...ids].sort(), `${key} folders`)
  }
})

test('old section URLs redirect to the new names', async () => {
  const { renamedPath } = await load('/src/lib/shopRoutes.js')
  assert.equal(renamedPath('/temu/products'), '/temu/goods')
  assert.equal(renamedPath('/ebay/inbox'), '/ebay/messages')
  assert.equal(renamedPath('/tiktok/fulfillment'), '/tiktok/packages')
  assert.equal(renamedPath('/temu/orders'), null)
})

test('section pages are gated by their main route', async () => {
  const { gateFor } = await load('/src/lib/shopRoutes.js')
  const { getShop } = await load('/src/marketplaces/index.js')
  assert.deepEqual(gateFor(getShop('ebay'), 'listings'), { gated: true, route: 'products' })
  assert.deepEqual(gateFor(getShop('ebay'), 'messages'), { gated: true, route: 'inbox' })
  assert.deepEqual(gateFor(getShop('temu'), 'after-sales'), { gated: false, route: 'orders' })
})

test("the same section on another shop uses that shop's name for it", async () => {
  const { sameSectionOn } = await load('/src/lib/shopRoutes.js')
  assert.equal(sameSectionOn('ebay', 'listings', 'temu'), 'goods')
  assert.equal(sameSectionOn('temu', 'goods', 'tiktok'), 'products')
  assert.equal(sameSectionOn('ebay', 'orders', 'temu'), 'orders')
})

test('every shop section has a sidebar icon (not the generic fallback)', async () => {
  const { SECTION_ICONS } = await load('/src/components/layout/sectionIcons.js')
  const { SHOPS } = await load('/src/marketplaces/index.js')
  const missing = SHOPS.flatMap((shop) => shop.subsections.filter((s) => !SECTION_ICONS[s.id]).map((s) => `${shop.key}:${s.id}`))
  assert.deepEqual(missing, [])
})
