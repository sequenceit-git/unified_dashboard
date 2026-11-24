import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
test.after(() => server.close())

const ATTRS = [
  { id: 'Brand', name: 'Brand', required: true, values: [] },
  { id: 'Color', name: 'Color', required: true, values: ['White', 'Black'] },
  { id: 'Material', name: 'Material', recommended: true, values: [] },
  { id: 'Style', name: 'Style', values: [] },
]

for (const shop of ['ebay/sections/listings', 'tiktok_shop/sections/products']) {
  test(`${shop}: the AI is asked only for empty required or recommended fields, and fills only empty ones`, async () => {
    const { missingForAi, applyAiFill } = await server.ssrLoadModule(`/src/marketplaces/${shop}/listing/aiFill.js`)
    const missing = missingForAi(ATTRS, { Brand: 'Leafy' })
    assert.deepEqual(missing.map((a) => a.id), ['Color', 'Material'])
    assert.deepEqual(Object.keys(missing[0]).sort(), ['freeText', 'id', 'name', 'required', 'values'])
    const out = applyAiFill({ Brand: 'Leafy', Material: 'Steel' }, { Color: 'White', Material: 'Ceramic', Brand: 'Other' })
    assert.deepEqual(out.aspects, { Brand: 'Leafy', Material: 'Steel', Color: 'White' })
    assert.deepEqual(out.filled, ['Color'])
  })
}

test('temu: template attributes go to the AI by name, its answers map back to Temu value ids', async () => {
  const { missingForAi, applyAiFill } = await server.ssrLoadModule('/src/marketplaces/temu/sections/goods/listing/aiFill.js')
  const template = { attributes: [
    { templatePid: 1, name: 'Material', required: true, values: [{ vid: 11, value: 'Ceramic' }, { vid: 12, value: 'Plastic' }], units: [] },
    { templatePid: 2, name: 'Color', required: true, values: [{ vid: 21, value: 'White' }], units: [] },
    { templatePid: 3, name: 'Capacity', required: true, values: [], units: [{ id: 5, name: 'ml' }] },
    { templatePid: 4, name: 'Style', required: false, values: [{ vid: 41, value: 'Modern' }], units: [] },
  ] }
  const form = { attributes: { 2: { vids: [21] } } }
  const missing = missingForAi(template, form)
  assert.deepEqual(missing.map((a) => a.id), ['1', '3'])
  assert.deepEqual(missing[0].values, ['Ceramic', 'Plastic'])
  const out = applyAiFill(template, form, { 1: 'ceramic', 3: '500', 2: 'White' })
  assert.deepEqual(out.attributes, { 1: { vids: [11] }, 2: { vids: [21] }, 3: { value: '500' } })
  assert.deepEqual(out.filled, ['1', '3'])
})
