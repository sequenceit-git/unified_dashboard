import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/listings/listing/productSteps.js')
test.after(() => server.close())

const OK = { title: 'Blue jacket', subtitle: '', basePrice: '20', stock: '3', weight: 1, length: 10, width: 10, height: 5, identifierCode: { type: '', code: '' }, bestOffer: { enabled: false }, ebayShipping: { paidBy: '' } }

test('the product form has its steps in order', async () => {
  const { PRODUCT_STEPS } = await load()
  assert.deepEqual(PRODUCT_STEPS.map((s) => s.id), ['photos', 'basics', 'specifics', 'variations', 'price', 'shipping', 'review'])
})

test('a complete product has no problems', async () => {
  const { productProblems } = await load()
  assert.deepEqual(productProblems(OK, [], { titleMax: 80, subtitleMax: 55 }), [])
})

test('each problem points to the step that fixes it', async () => {
  const { productProblems } = await load()
  const p = productProblems({ ...OK, title: '', basePrice: '', stock: '' }, [], { titleMax: 80 })
  assert.deepEqual(p.map((x) => [x.step, x.field]), [['basics', 'title'], ['price', 'basePrice'], ['price', 'stock']])
  const long = productProblems({ ...OK, title: 'x'.repeat(81), subtitle: 'y'.repeat(56) }, [], { titleMax: 80, subtitleMax: 55 })
  assert.deepEqual(long.map((x) => x.field), ['title', 'subtitle'])
  assert.match(long[0].message, /80/)
})

test('with variants, price and stock come from them; package details only when required', async () => {
  const { productProblems } = await load()
  assert.deepEqual(productProblems({ ...OK, basePrice: '', stock: '' }, [{ sku: 'A', price: 5, stock: 1, options: { Color: 'Red' } }, { sku: 'B', price: 6, stock: 1, options: { Color: 'Blue' } }], {}).filter((x) => x.step === 'price' && ['basePrice', 'stock'].includes(x.field)), [])
  assert.deepEqual(productProblems({ ...OK, weight: '' }, [], { packageRequired: true }).map((x) => [x.step, x.field]), [['shipping', 'weight']])
  assert.deepEqual(productProblems({ ...OK, weight: '' }, [], { packageRequired: false }), [])
})

test('step status: which steps have problems', async () => {
  const { stepsWithProblems } = await load()
  assert.deepEqual([...stepsWithProblems([{ step: 'basics' }, { step: 'price' }, { step: 'basics' }])].sort(), ['basics', 'price'])
})

test('whole stock, cents and package sizes of at least 0.1', async () => {
  const { productProblems } = await load()
  assert.deepEqual(productProblems({ ...OK, stock: '2.5' }, [], {}).map((x) => x.message), ['Stock must be a whole number.'])
  assert.deepEqual(productProblems({ ...OK, basePrice: '9.999' }, [], {}).map((x) => x.message), ['Price can have at most 2 decimals.'])
  assert.deepEqual(productProblems({ ...OK, length: 0.05 }, [], { packageRequired: true }).map((x) => x.field), ['length'])
})
