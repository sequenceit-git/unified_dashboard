import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/listings/listing/directSteps.js')
test.after(() => server.close())

const OK = {
  shopLabel: 'eBay', title: 'Blue jacket', titleMax: 80, subtitle: '', subtitleMax: 55, variants: [], price: '20', stock: '2',
  canList: true, upcRequired: false, identifierCode: { type: '', code: '' }, bestOfferAllowed: true, bestOffer: { enabled: false },
  summaryPrice: 0, ebayShipping: { paidBy: '' }, images: 1, packageRequired: false, weight: 1, needsCategory: true, categoryId: '9',
  missingRequired: [], hasShop: true,
}

test('Direct listing steps, in order', async () => {
  const { DIRECT_STEPS } = await load()
  assert.deepEqual(DIRECT_STEPS.map((s) => s.id), ['link', 'found', 'category', 'price', 'review'])
})

test('the same save checks as before, each on its step', async () => {
  const { directProblems } = await load()
  assert.deepEqual(directProblems(OK), [])
  const at = (patch) => directProblems({ ...OK, ...patch }).map((p) => [p.step, p.message])
  assert.deepEqual(at({ title: '' }), [['found', 'Add a title.']])
  assert.deepEqual(at({ images: 0 }), [['found', 'Add at least one image.']])
  assert.deepEqual(at({ price: '' }), [['price', 'Set your selling price.']])
  assert.deepEqual(at({ stock: '0' }), [['price', 'Set stock to at least 1 before listing.']])
  assert.deepEqual(at({ stock: '0', canList: false }), [])
  assert.deepEqual(at({ categoryId: '' }), [['category', 'Pick a eBay category.']])
  assert.deepEqual(at({ missingRequired: ['Size'] }), [['category', 'Fill in: Size.']])
  assert.deepEqual(at({ packageRequired: true, weight: 0 }), [['price', 'eBay needs the package weight and size.']])
  assert.deepEqual(at({ hasShop: false }), [['review', 'Connect eBay in Settings first.']])
})
