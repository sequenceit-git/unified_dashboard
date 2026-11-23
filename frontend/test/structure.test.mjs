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

const SHOP_KEYS = ['ebay', 'tiktok_shop', 'temu']
const allFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? allFiles(full) : /\.(js|jsx)$/.test(entry.name) ? [full] : []
})
const rel = (file) => path.relative(SRC, file).split(path.sep).join('/')
/** Relative import targets of a file, resolved to paths under src/. */
function importsOf(file) {
  const source = fs.readFileSync(file, 'utf8')
  return [...source.matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => rel(path.resolve(path.dirname(file), m[1])))
}

// Each shop is self-contained: its pages, sections and sub-parts live in src/marketplaces/<key>/.
test('a shop folder never imports from another shop folder', () => {
  const hits = []
  for (const key of SHOP_KEYS) {
    for (const file of allFiles(path.join(SRC, 'marketplaces', key))) {
      for (const target of importsOf(file)) {
        const other = SHOP_KEYS.find((k) => k !== key && target.startsWith(`marketplaces/${k}/`))
        if (other) hits.push(`${rel(file)} imports ${target}`)
      }
    }
  }
  assert.deepEqual(hits, [])
})

test('shared code reaches a shop only through the registry (src/marketplaces/index.js)', () => {
  const hits = []
  for (const file of files(SRC)) {
    for (const target of importsOf(file)) if (SHOP_KEYS.some((k) => target.startsWith(`marketplaces/${k}`))) hits.push(`${rel(file)} imports ${target}`)
  }
  assert.deepEqual(hits, [])
})

test("a shop folder doesn't name another shop", () => {
  const hits = []
  for (const key of SHOP_KEYS) {
    const others = SHOP_KEYS.filter((k) => k !== key)
    for (const file of allFiles(path.join(SRC, 'marketplaces', key))) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (others.some((k) => new RegExp(`['"\`/]${k}['"\`/]`).test(line))) hits.push(`${rel(file)}:${i + 1}: ${line.trim()}`)
      })
    }
  }
  assert.deepEqual(hits, [])
})

// Components (.jsx) are capped; a page's state hook (.js) holds one form's logic and may be longer.
test('page components stay under 500 lines', () => {
  const over = []
  const pageFiles = [...files(path.join(SRC, 'pages')), ...SHOP_KEYS.flatMap((k) => allFiles(path.join(SRC, 'marketplaces', k)))]
  for (const file of pageFiles.filter((f) => f.endsWith('.jsx'))) {
    const rel = path.relative(SRC, file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n').length
    if (lines > 500) over.push(`${rel}: ${lines} lines (max 500)`)
  }
  assert.deepEqual(over, [])
})
