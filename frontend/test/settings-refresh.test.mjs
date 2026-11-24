import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = (path) => server.ssrLoadModule(path)
test.after(() => server.close())

test('only the first load shows the spinner; a background refetch keeps the page', async () => {
  const { isFirstLoad } = await load('/src/hooks/useApi.js')
  assert.equal(isFirstLoad({ loading: true, data: null }), true)
  assert.equal(isFirstLoad({ loading: true, data: [] }), false)
  assert.equal(isFirstLoad({ loading: true, data: [{ _id: 's1' }] }), false)
  assert.equal(isFirstLoad({ loading: false, data: null }), false)
})

test('the Settings page does not swap itself for a spinner when a shop syncs', () => {
  const source = readFileSync(new URL('../src/pages/settings/SettingsPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /shopsRes\.loading \|\|/)
  assert.match(source, /isFirstLoad\(shopsRes\)/)
})
