import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('tables group into tabs in loader order', async () => {
  const { sectionTabs } = await load('/src/marketplaces/temu/sectionTabs.js')
  const tabs = sectionTabs({ label: 'Ads', tables: [{ id: 'a', tab: 'Overview' }, { id: 'b', tab: 'By product' }, { id: 'c', tab: 'Overview' }], summary: [{ label: 'Spend' }, { label: 'ROAS', tab: 'By product' }, { label: 'Lost', tab: 'Nowhere' }] })
  assert.deepEqual(tabs.map((t) => [t.label, t.tables.map((x) => x.id), t.summary.map((s) => s.label)]), [['Overview', ['a', 'c'], ['Spend', 'Lost']], ['By product', ['b'], ['Spend', 'ROAS']]])
  assert.deepEqual(sectionTabs(null), [])
})

test('an action button is disabled while its request runs', async () => {
  const { actionState } = await load('/src/marketplaces/temu/actionState.js')
  const s = actionState()
  assert.equal(s.start('g1:enrol'), true)
  assert.equal(s.start('g1:enrol'), false)
  s.done('g1:enrol')
  assert.equal(s.start('g1:enrol'), true)
})

test('own tabs stay when Temu’s API for a section is not available', async () => {
  const { pageMode } = await load('/src/marketplaces/temu/sectionTabs.js')
  assert.equal(pageMode({ available: false }, [{ id: 'x' }]), 'own-tabs-only')
  assert.equal(pageMode({ available: false }, []), 'unavailable')
  assert.equal(pageMode({}, []), 'full')
})

test('Temu section files never come from another shop', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.join(process.cwd(), 'src/marketplaces/temu')
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  for (const file of walk(dir).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /marketplaces\/(ebay|tiktok_shop)\/|from '\.\.\/(\.\.\/)?(ebay|tiktok_shop)\//, file)
  }
})

const TEMU_TEMPLATE = {
  attributes: [
    { pid: 10, refPid: 100, templatePid: 1000, name: 'Material', required: true, multiple: false, values: [{ vid: 1, value: 'Cotton' }, { vid: 2, value: 'Polyester' }], units: [], parent: null },
    { pid: 11, refPid: 101, templatePid: 1001, name: 'Cotton share', required: true, multiple: false, values: [], units: [{ id: 5, name: '%' }], parent: { refPid: 100, vids: [1] } },
  ],
  variants: [{ templatePid: 2000, refPid: 200, parentSpecId: 3001, name: 'Color', values: [{ vid: 31, value: 'Red', specId: 9001 }, { vid: 32, value: 'Blue', specId: 9002 }] }],
  customVariants: [{ parentSpecId: 3002, name: 'Size' }],
}

test('a child attribute field shows only after its parent value is chosen', async () => {
  const { visibleAttributes } = await load('/src/marketplaces/temu/sections/goods/listing/temuForm.js')
  assert.deepEqual(visibleAttributes(TEMU_TEMPLATE, { attributes: {} }).map((a) => a.templatePid), [1000])
  assert.deepEqual(visibleAttributes(TEMU_TEMPLATE, { attributes: { 1000: { vids: [2] } } }).map((a) => a.templatePid), [1000])
  assert.deepEqual(visibleAttributes(TEMU_TEMPLATE, { attributes: { 1000: { vids: [1] } } }).map((a) => a.templatePid), [1000, 1001])
})

test('SKUs are made from the chosen variant values and keep what was typed', async () => {
  const { skusFor, formFromProduct } = await load('/src/marketplaces/temu/sections/goods/listing/temuForm.js')
  const form = formFromProduct({ title: 'Tee', sku: 'TEE', basePrice: 9.99, stock: 4, weight: 0.5, images: ['/uploads/a.jpg'] })
  assert.equal(form.title, 'Tee')
  assert.equal(form.outGoodsSn, 'TEE')
  const red = { parentSpecId: 3001, specId: 9001, vid: 31, value: 'Red' }
  const blue = { parentSpecId: 3001, specId: 9002, vid: 32, value: 'Blue' }
  const xl = { parentSpecId: 3002, specId: 7777, value: 'XL' }
  const one = skusFor([[red, blue]], [], form)
  assert.deepEqual(one.map((s) => s.specs.map((x) => x.value)), [['Red'], ['Blue']])
  assert.equal(one[0].basePrice, '9.99')
  assert.equal(one[0].quantity, '4')
  one[1].basePrice = '12'
  const two = skusFor([[red, blue], [xl]], one, form)
  assert.deepEqual(two.map((s) => s.specs.map((x) => x.value)), [['Red', 'XL'], ['Blue', 'XL']])
  // Values typed for Blue are kept when a variant type is added only if the SKU is the same; a new combination starts from the product.
  assert.equal(two[1].basePrice, '9.99')
  assert.equal(skusFor([[red, blue]], one, form)[1].basePrice, '12')
})

test('the form keeps values after a refused add', async () => {
  const { problemsByField, validate } = await load('/src/marketplaces/temu/sections/goods/listing/temuForm.js')
  const byField = problemsByField({ error: 'Material is required.', problems: [{ field: 'attributes.1000', message: 'Material is required.' }, { field: 'variants.0.weight', message: 'Enter the weight: 0.1–9999.9 lb.' }] })
  assert.deepEqual(byField, { 'attributes.1000': 'Material is required.', 'variants.0.weight': 'Enter the weight: 0.1–9999.9 lb.' })
  assert.deepEqual(problemsByField({ error: 'The catId not a leaf category' }), { _: 'The catId not a leaf category' })
  const errs = validate({ catId: 1, title: 'Tee', images: ['x'], shippingTemplateId: 'T1', attributes: {}, variants: [] }, TEMU_TEMPLATE)
  assert.deepEqual(Object.keys(errs), ['attributes.1000', 'variants'])
})

test('a Temu file field gives name, type, size and a data URL', async () => {
  const { readFileValue } = await load('/src/marketplaces/temu/fileField.js')
  class Reader { readAsDataURL(f) { this.result = `data:${f.type};base64,JVBERg==`; this.onload() } }
  assert.deepEqual(await readFileValue({ name: 'label.pdf', type: 'application/pdf', size: 4 }, Reader), { name: 'label.pdf', type: 'application/pdf', size: 4, dataUrl: 'data:application/pdf;base64,JVBERg==' })
})
