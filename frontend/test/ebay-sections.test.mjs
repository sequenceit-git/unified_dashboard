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
