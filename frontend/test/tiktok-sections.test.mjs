import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('tables group into tabs in loader order', async () => {
  const { sectionTabs } = await load('/src/marketplaces/tiktok_shop/sectionTabs.js')
  const tabs = sectionTabs({ label: 'Finance', tables: [{ id: 'a', tab: 'Balance' }, { id: 'b' }, { id: 'c', tab: 'Unsettled orders' }, { id: 'd', tab: 'Balance' }] })
  assert.deepEqual(tabs.map((t) => t.label), ['Balance', 'Finance', 'Unsettled orders'])
  assert.deepEqual(tabs[0].tables.map((t) => t.id), ['a', 'd'])
})

test('tiles without a tab show on every tab', async () => {
  const { sectionTabs } = await load('/src/marketplaces/tiktok_shop/sectionTabs.js')
  const tabs = sectionTabs({ summary: [{ label: 'All' }, { label: 'Only B', tab: 'B' }, { label: 'Lost', tab: 'Nowhere' }], tables: [{ id: 'a', tab: 'A' }, { id: 'b', tab: 'B' }] })
  assert.deepEqual(tabs.map((t) => t.summary.map((s) => s.label)), [['All', 'Lost'], ['All', 'Only B']])
  assert.equal(sectionTabs({ tables: [{ id: 'x' }] }).length, 1)
  assert.deepEqual(sectionTabs(undefined), [])
})

test('an action button is disabled while its request runs', async () => {
  const { actionState } = await load('/src/marketplaces/tiktok_shop/actionState.js')
  const s = actionState()
  assert.equal(s.start('pkg1:ship'), true)
  assert.equal(s.isBusy('pkg1:ship'), true)
  assert.equal(s.start('pkg1:ship'), false)
  s.done('pkg1:ship')
  assert.equal(s.start('pkg1:ship'), true)
})

test('TikTok section files never come from another shop', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.join(process.cwd(), 'src/marketplaces/tiktok_shop')
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  for (const file of walk(dir).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /marketplaces\/(ebay|temu)\/|from '\.\.\/(\.\.\/)?(ebay|temu)\//, file)
  }
})
