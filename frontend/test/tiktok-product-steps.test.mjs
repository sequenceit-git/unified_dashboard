import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/tiktok_shop/sections/products/listing/productSteps.js')
test.after(() => server.close())

const OK = { title: 'Phone case', basePrice: '12.50', stock: '5', listPrice: '', identifierCode: { type: '', code: '' }, weight: 1, length: 10, width: 10, height: 5 }

test('a complete product has no problems', async () => {
  const { productProblems } = await load()
  assert.deepEqual(productProblems(OK, [], { titleMax: 255 }), [])
})

test('each problem points to its step, in step order', async () => {
  const { productProblems, stepsWithProblems } = await load()
  const p = productProblems({ ...OK, title: '', basePrice: '', stock: '1.5', weight: 0 }, [], { packageRequired: true })
  assert.deepEqual(p.map((x) => [x.step, x.field]), [['basics', 'title'], ['price', 'basePrice'], ['price', 'stock'], ['package', 'weight']])
  assert.deepEqual([...stepsWithProblems(p)], ['basics', 'price', 'package'])
})

test("TikTok's MSRP range and title limit", async () => {
  const { productProblems } = await load()
  assert.match(productProblems({ ...OK, listPrice: '10' }, [])[0].message, /MSRP/)
  assert.match(productProblems({ ...OK, listPrice: '9000' }, [])[0].message, /7,600/)
  assert.match(productProblems({ ...OK, title: 'x'.repeat(30) }, [], { titleMax: 20 })[0].message, /at most 20/)
})

test('with variations, price and stock come from them (no product price needed)', async () => {
  const { productProblems } = await load()
  const p = productProblems({ ...OK, basePrice: '', stock: '' }, [{ sku: 'A', price: 10, stock: 2, options: { Color: 'Red' } }])
  assert.equal(p.some((x) => x.field === 'basePrice' || x.field === 'stock'), false)
})
