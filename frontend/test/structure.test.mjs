import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(import.meta.dirname, '..', 'src')

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'marketplaces' && dir === SRC ? [] : files(full)
    return /\.(js|jsx)$/.test(entry.name) ? [full] : []
  })
}

test('no hardcoded shop lists or shop-name checks outside src/marketplaces', () => {
  const hits = []
  for (const file of files(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('// shop-literal-ok:')) return
      if (/\[\s*'ebay',\s*'tiktok_shop'/.test(line) || /[!=]== '(ebay|tiktok_shop|temu)'/.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(hits, [])
})


// Pages still over 500 lines: capped at today's size until they are split with a UI test pass.
const LARGE_PAGE_CAPS = {
  'pages/products/DirectListModal.jsx': 902,
  'pages/products/ListModal.jsx': 806,
  'pages/sub-admins/SubAdminFormPage.jsx': 686,
  'pages/shop/ShopSectionPage.jsx': 555,
  'pages/sub-admins/SubAdminManagementPage.jsx': 521,
  'pages/discovery/ProductDiscoveryPage.jsx': 512,
}

test('page files stay under 500 lines (or under their cap)', () => {
  const over = []
  for (const file of files(path.join(SRC, 'pages'))) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n').length
    const cap = LARGE_PAGE_CAPS[rel] || 500
    if (lines > cap) over.push(`${rel}: ${lines} lines (max ${cap})`)
  }
  assert.deepEqual(over, [])
})
