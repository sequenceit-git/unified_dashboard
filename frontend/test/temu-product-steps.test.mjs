import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/goods/listing/productSteps.js')
test.after(() => server.close())

const OK = { title: 'Plant pot', basePrice: '12.99', stock: '4', weight: 1, length: 10, width: 10, height: 5 }

test('Temu product form steps and checks, each on its step', async () => {
  const { TEMU_PRODUCT_STEPS, productProblems } = await load()
  assert.deepEqual(TEMU_PRODUCT_STEPS.map((s) => s.id), ['photos', 'basics', 'price', 'package', 'review'])
  assert.deepEqual(productProblems(OK, [], { titleMax: 250 }), [])
  const at = (patch, opts = { titleMax: 250 }) => productProblems({ ...OK, ...patch }, [], opts).map((p) => [p.step, p.message])
  assert.deepEqual(at({ title: '' }), [['basics', 'Enter a title.']])
  assert.deepEqual(at({ title: 'x'.repeat(251) }), [['basics', 'Temu titles can be at most 250 characters.']])
  assert.deepEqual(at({ basePrice: '' }), [['price', 'Enter a price.']])
  assert.deepEqual(at({ basePrice: '1.999' }), [['price', 'Price can have at most 2 decimals.']])
  assert.deepEqual(at({ stock: '2.5' }), [['price', 'Stock must be a whole number.']])
  assert.deepEqual(at({ weight: 0 }, { titleMax: 250, packageRequired: true }), [['package', 'Enter the package weight (at least 0.1).']])
  assert.deepEqual(productProblems({ ...OK, basePrice: '', stock: '' }, [{ sku: 'A' }], { titleMax: 250 }), [], 'with variants, price and stock come from them')
})
