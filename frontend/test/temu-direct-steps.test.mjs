import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/goods/listing/directSteps.js')
test.after(() => server.close())

const OK = { shopLabel: 'Temu Shop', title: 'Plant pot', titleMax: 250, price: '12.99', stock: '3', images: 1, packageRequired: false, weight: 1, missingRequired: [] }

test('Temu Direct listing: two steps, the same save checks plus whole stock and cents', async () => {
  const { TEMU_DIRECT_STEPS, directProblems } = await load()
  assert.deepEqual(TEMU_DIRECT_STEPS.map((s) => s.id), ['link', 'found'])
  assert.deepEqual(directProblems(OK), [])
  const at = (patch) => directProblems({ ...OK, ...patch }).map((p) => p.message)
  assert.deepEqual(at({ title: '' }), ['Add a title.'])
  assert.deepEqual(at({ title: 'x'.repeat(251) }), ['Temu Shop titles can be at most 250 characters.'])
  assert.deepEqual(at({ price: '' }), ['Set your selling price.'])
  assert.deepEqual(at({ price: '1.999' }), ['Price can have at most 2 decimals.'])
  assert.deepEqual(at({ stock: '1.5' }), ['Stock must be a whole number.'])
  assert.deepEqual(at({ images: 0 }), ['Add at least one image.'])
  assert.deepEqual(at({ missingRequired: ['Material'] }), ['Fill in: Material.'])
  assert.ok(directProblems({ ...OK, title: '' }).every((p) => p.step === 'found'))
})
