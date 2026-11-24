import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// overflow-x: hidden on an ancestor turns it into a scroll box, and the sticky sidebar and top bar
// then stick to that box instead of the window: on a long page the sidebar scrolls away (looks cut).
test('nothing around the sticky sidebar and top bar creates a scroll box', () => {
  const layout = readFileSync(new URL('../src/components/layout/DashboardLayout.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(layout, /overflow-x-hidden|overflow-hidden|overflow-y-auto/)
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const htmlBody = css.match(/html,\s*body\s*\{[^}]*\}/)?.[0] || ''
  assert.doesNotMatch(htmlBody, /overflow-x:\s*hidden/)
})
