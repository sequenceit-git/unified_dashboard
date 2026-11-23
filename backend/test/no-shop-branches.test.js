const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

// The shared core must not branch on shop names; shop behaviour comes from the adapters.
const CORE_FILES = [
  'services/marketplace/index.js',
  'services/marketplace/profiles.js',
  'services/marketplace/sections.js',
  'routes/system/shops.js',
  'services/core/syncQueue.js',
  'services/inbox/inboxBot.js',
]

test('core files have no shop-name literals', () => {
  const hits = []
  for (const file of CORE_FILES) {
    const lines = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      const literal = /['"`](ebay|tiktok_shop|temu)['"`]/.test(line)
      const shopFolder = /marketplaces\/(ebay|tiktok_shop|temu)\b/.test(line)
      if ((literal || shopFolder) && !line.includes('// shop-literal-ok:')) hits.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(hits, [])
})
