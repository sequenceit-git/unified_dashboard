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

test('no shop-name strings outside src/marketplaces', () => {
  const hits = []
  for (const file of files(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('// shop-literal-ok:')) return
      // Any shop key as a string literal (lists, comparisons, defaults) belongs in src/marketplaces/.
      if (/['"`](ebay|tiktok_shop|temu)['"`]/.test(line.replace(/\/\/.*$/, ''))) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(hits, [])
})



// Components (.jsx) are capped; a page's state hook (.js) holds one form's logic and may be longer.
test('page components stay under 500 lines', () => {
  const over = []
  for (const file of files(path.join(SRC, 'pages')).filter((f) => f.endsWith('.jsx'))) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n').length
    if (lines > 500) over.push(`${rel}: ${lines} lines (max 500)`)
  }
  assert.deepEqual(over, [])
})
