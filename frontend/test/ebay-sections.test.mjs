import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('tables group into tabs in loader order', async () => {
  const { sectionTabs } = await load('/src/marketplaces/ebay/sectionTabs.js')
  const tabs = sectionTabs({ label: 'Returns & cases', tables: [{ id: 'a', tab: 'Inquiries' }, { id: 'b' }, { id: 'c', tab: 'Cases' }, { id: 'd', tab: 'Inquiries' }] })
  assert.deepEqual(tabs.map((t) => t.label), ['Inquiries', 'Returns & cases', 'Cases'])
  assert.deepEqual(tabs[0].tables.map((t) => t.id), ['a', 'd'])
  assert.equal(tabs[1].id, 'main')
})

test('tiles without a tab show on every tab', async () => {
  const { sectionTabs } = await load('/src/marketplaces/ebay/sectionTabs.js')
  const tabs = sectionTabs({ summary: [{ label: 'All' }, { label: 'Only B', tab: 'B' }], tables: [{ id: 'a', tab: 'A' }, { id: 'b', tab: 'B' }] })
  assert.deepEqual(tabs.map((t) => t.summary.map((s) => s.label)), [['All'], ['All', 'Only B']])
})

test('one tab means no tab bar', async () => {
  const { sectionTabs } = await load('/src/marketplaces/ebay/sectionTabs.js')
  assert.equal(sectionTabs({ tables: [{ id: 'x' }] }).length, 1)
  assert.deepEqual(sectionTabs(null), [])
})

test('an action button is disabled while its request runs', async () => {
  const { actionState } = await load('/src/marketplaces/ebay/ActionButton.jsx')
  const s = actionState()
  assert.equal(s.start('r1:accept'), true)
  assert.equal(s.isBusy('r1:accept'), true)
  assert.equal(s.start('r1:accept'), false)
  s.done('r1:accept')
  assert.equal(s.isBusy('r1:accept'), false)
  assert.equal(s.start('r1:accept'), true)
})

test('tiles whose tab has no table show on the first tab', async () => {
  const { sectionTabs } = await load('/src/marketplaces/ebay/sectionTabs.js')
  const tabs = sectionTabs({ summary: [{ label: 'Available', tab: 'Funds' }, { label: 'Paid out', tab: 'Payouts' }], tables: [{ id: 'p', tab: 'Payouts' }, { id: 'e', tab: 'Order earnings' }] })
  assert.deepEqual(tabs.map((t) => t.summary.map((s) => s.label)), [['Available', 'Paid out'], []])
})

test('a multiple field returns the chosen values as an array', async () => {
  const { toggleOption, isFilled } = await load('/src/marketplaces/ebay/actionFields.js')
  let v = toggleOption(undefined, '11')
  v = toggleOption(v, '22')
  assert.deepEqual(v, ['11', '22'])
  assert.deepEqual(toggleOption(v, '11'), ['22'])
  assert.equal(isFilled({ name: 'ids', multiple: true, options: [] }, []), false)
  assert.equal(isFilled({ name: 'ids', multiple: true, options: [] }, ['1']), true)
  assert.equal(isFilled({ name: 'note', optional: true }, ''), true)
})

test('a file field gives name, type, size and a data URL', async () => {
  const { fileValue, isFilled } = await load('/src/marketplaces/ebay/actionFields.js')
  class Reader { readAsDataURL(f) { this.result = `data:${f.type};base64,QUJD`; this.onload() } }
  const value = await fileValue({ name: 'proof.png', type: 'image/png', size: 3 }, Reader)
  assert.deepEqual(value, { name: 'proof.png', type: 'image/png', size: 3, dataUrl: 'data:image/png;base64,QUJD' })
  assert.equal(isFilled({ name: 'file', type: 'file' }, value), true)
  assert.equal(isFilled({ name: 'file', type: 'file' }, undefined), false)
})

test('a failed action keeps the dialog open with its values', async () => {
  const { dialogAfter } = await load('/src/marketplaces/ebay/actionFields.js')
  assert.deepEqual(dialogAfter({ error: 'eBay said no' }), { open: true, error: 'eBay said no' })
  assert.deepEqual(dialogAfter({ message: 'Done' }), { open: false, error: '' })
})

test('no file under marketplaces/ebay imports from temu or tiktok_shop', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const root = new URL('../src/marketplaces/ebay', import.meta.url).pathname
  const bad = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(jsx?|mjs)$/.test(name) && /from\s+['"][^'"]*(temu|tiktok_shop)[/'"]/.test(readFileSync(p, 'utf8'))) bad.push(p)
    }
  }
  walk(root)
  assert.deepEqual(bad, [])
})

test('buyer pays needs a cost on a flat listing', async () => {
  const { validateShippingPayer } = await load('/src/marketplaces/ebay/sections/listings/listing/shippingPayer.js')
  assert.equal(validateShippingPayer({ paidBy: 'buyer', cost: '' }, 'Flat'), 'Enter the shipping cost the buyer pays.')
  assert.equal(validateShippingPayer({ paidBy: 'buyer', cost: '0' }, 'Flat'), 'Enter the shipping cost the buyer pays.')
  assert.equal(validateShippingPayer({ paidBy: 'buyer', cost: '' }, 'Calculated'), '')
  assert.equal(validateShippingPayer({ paidBy: 'buyer', cost: '4.99' }, 'Flat'), '')
  assert.equal(validateShippingPayer({ paidBy: 'seller' }, 'Flat'), '')
  assert.equal(validateShippingPayer(undefined, 'Flat'), '')
})

test('free shipping drops the cost', async () => {
  const { cleanShippingPayer } = await load('/src/marketplaces/ebay/sections/listings/listing/shippingPayer.js')
  assert.deepEqual(cleanShippingPayer({ paidBy: 'seller', cost: '5' }), { paidBy: 'seller' })
  assert.equal(cleanShippingPayer({}), undefined)
})

test('cost is sent as a number', async () => {
  const { cleanShippingPayer, shippingPayerFrom } = await load('/src/marketplaces/ebay/sections/listings/listing/shippingPayer.js')
  assert.deepEqual(cleanShippingPayer({ paidBy: 'buyer', cost: '6.50' }), { paidBy: 'buyer', cost: 6.5 })
  assert.deepEqual(shippingPayerFrom({ ebayShipping: { paidBy: 'seller', cost: 0, type: 'Flat', policy: 'Std' } }), { paidBy: 'seller', cost: '', type: 'Flat', policy: 'Std' })
  assert.deepEqual(shippingPayerFrom({}), { paidBy: 'buyer', cost: '', type: 'Flat', policy: '' })
})
