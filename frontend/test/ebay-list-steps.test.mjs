import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/listings/listing/listSteps.js')
test.after(() => server.close())

const OK = {
  hasShop: true, canList: true, title: 'Blue jacket', titleMax: 80, subtitle: '', subtitleMax: 55,
  variants: [], price: '20', stock: '2', upcRequired: false, identifierCode: { type: '', code: '' },
  bestOfferAllowed: true, bestOffer: { enabled: false }, summaryPrice: 0, ebayShipping: { paidBy: '' },
  needsCategory: true, categoryId: '123', missingRequired: [], images: 1,
}

test('List on eBay steps, in order', async () => {
  const { LIST_STEPS } = await load()
  assert.deepEqual(LIST_STEPS.map((s) => s.id), ['details', 'category', 'price', 'shipping', 'review'])
})

test('a ready listing has no problems', async () => {
  const { listProblems } = await load()
  assert.deepEqual(listProblems(OK), [])
})

test("the same checks as before, each on the step that fixes it", async () => {
  const { listProblems } = await load()
  const at = (patch) => listProblems({ ...OK, ...patch }).map((p) => [p.step, p.message])
  assert.deepEqual(at({ hasShop: false }), [['details', 'Choose a shop to list on.']])
  assert.deepEqual(at({ title: ' ' }), [['details', 'Title is required.']])
  assert.deepEqual(at({ title: 'x'.repeat(81) }), [['details', 'eBay titles can be at most 80 characters.']])
  assert.deepEqual(at({ images: 0 }), [['details', 'Add at least one photo.']])
  assert.deepEqual(at({ categoryId: '' }), [['category', 'Choose an eBay category.']])
  assert.deepEqual(at({ missingRequired: ['Size', 'Color'] }), [['category', 'Fill in: Size, Color.']])
  assert.deepEqual(at({ price: '0' }), [['price', 'Set a price above 0.']])
  assert.deepEqual(at({ stock: '0' }), [['price', 'Stock must be at least 1 to list a product.']])
  assert.deepEqual(at({ upcRequired: true }), [['price', 'This eBay category requires a product identifier (or click "Does not apply").']])
  assert.equal(listProblems({ ...OK, canList: false, canListNote: 'Not available' })[0].message, 'Not available')
})
