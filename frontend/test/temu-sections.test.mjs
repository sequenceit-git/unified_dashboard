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
