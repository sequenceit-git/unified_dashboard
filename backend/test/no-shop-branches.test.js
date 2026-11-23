const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

// Shared code must not branch on shop names; shop behaviour comes from the adapters in
// marketplaces/<key>/. agent/ is left out: its eBay/Temu names are web-search sources.
const ROOT = path.join(__dirname, '..')
const SHARED = ['services', 'routes', 'models', 'middleware', 'utils', 'config', 'server.js']
const walk = (rel) => fs.statSync(path.join(ROOT, rel)).isDirectory()
  ? fs.readdirSync(path.join(ROOT, rel)).flatMap((name) => walk(path.join(rel, name)))
  : rel.endsWith('.js') ? [rel] : []
const CORE_FILES = SHARED.flatMap(walk)

test('shared files have no shop-name literals', () => {
  const hits = []
  for (const file of CORE_FILES) {
    const lines = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      const literal = /['"`](ebay|tiktok_shop|temu)['"`]/.test(line)
      const shopFolder = /marketplaces\/(ebay|tiktok_shop|temu)\b/.test(line)
      const shopKey = /(^|[{,\s])(ebay|tiktok_shop|tiktok|temu)\s*:/.test(line)
      if ((literal || shopFolder || shopKey) && !line.includes('// shop-literal-ok:')) hits.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(hits, [])
})
