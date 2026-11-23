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
  assert.deepEqual(MARKETPLACE_SUBSECTIONS.temu.map((s) => s.id), ['products', 'inventory', 'orders', 'fulfillment', 'returns', 'prices', 'promotions', 'ads', 'customers', 'analytics'])
})

test('section tables with actions per shop', async () => {
  const { getShop } = await load('/src/marketplaces/index.js')
  const wired = (key) => Object.fromEntries(Object.entries(getShop(key).sections).map(([id, s]) => [id, Object.keys(s.tableActions).sort()]))
  assert.deepEqual(wired('ebay'), { returns: ['cancellations', 'returns'], offers: ['eligible'], promotions: ['activities', 'promotions'] })
  assert.deepEqual(wired('tiktok_shop'), { returns: ['cancellations', 'returns'], promotions: ['activities', 'promotions'], fulfillment: ['packages'] })
  assert.deepEqual(wired('temu'), { returns: ['cancellations', 'returns'] })
})

test('Temu returns: approve & refund only, reviewing label; eBay: approve and decline', async () => {
  const { getShop } = await load('/src/marketplaces/index.js')
  const ctx = { onAction: () => {} }
  const temu = getShop('temu').sections.returns.tableActions
  assert.deepEqual(texts(temu.returns({ status: 'Pending' }, ctx)), ['Approve & refund'])
  assert.deepEqual(texts(temu.returns({ status: 'Platform reviewing' }, ctx)), ['Temu reviewing'])
  assert.deepEqual(texts(temu.cancellations({ status: 'Pending' }, ctx)), ['Approve'])
  const ebay = getShop('ebay').sections.returns.tableActions
  assert.deepEqual(texts(ebay.returns({ status: 'Requested' }, ctx)), ['Approve', 'Decline'])
  assert.deepEqual(texts(ebay.cancellations({ status: 'Closed' }, ctx)), ['Processed'])
})

test('promotions: eBay hides markdown sales, TikTok deactivates and cannot resume', async () => {
  const { getShop } = await load('/src/marketplaces/index.js')
  const ctx = { onAction: () => {} }
  const ebay = getShop('ebay').sections.promotions.tableActions.promotions
  assert.deepEqual(texts(ebay({ promotionId: 1, status: 'Running', type: 'Markdown sale' }, ctx)), [])
  assert.deepEqual(texts(ebay({ promotionId: 1, status: 'Paused', type: 'Order discount' }, ctx)), ['Resume'])
  const tt = getShop('tiktok_shop').sections.promotions.tableActions.promotions
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
  assert.equal(d('temu').canList, false)
})
