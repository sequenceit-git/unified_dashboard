/**
 * The marketplace API endpoints each shop's code actually calls (non-test files under
 * backend/marketplaces/<key>/), as endpoint ids shared with docs/api-coverage/:
 *   eBay REST  "<METHOD> /sell/analytics/v1/traffic_report"   eBay Trading  "Trading:GetItem"
 *   TikTok     "<METHOD> /analytics/202405/shop_products/performance"   Temu  "bg.local.goods.list.query"
 */
const fs = require('fs')
const path = require('path')

const BACKEND = path.join(__dirname, '..', '..')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function files(key) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'test') walk(full) } else if (entry.name.endsWith('.js')) out.push(full)
    }
  }
  walk(path.join(BACKEND, 'marketplaces', key))
  return out
}

/** `${encodeURIComponent(orderId)}` / `:orderId` → `{orderId}`; query strings and trailing junk dropped. */
function cleanPath(raw) {
  return raw
    .replace(/\$\{(?:[^{}]*?\(([A-Za-z_$][\w$.]*)\)|([A-Za-z_$][\w$.]*))[^{}]*\}/g, (m, inner, plain) => `{${(inner || plain || 'param').split('.').pop()}}`)
    .replace(/\$\{[^}]*\}/g, '{param}')
    .replace(/\/:([A-Za-z_]\w*)/g, '/{$1}')
    .split('?')[0]
    .replace(/[`'"),;\s]+$/, '')
    .replace(/\/$/, '')
}

/** The HTTP method at a call site: `'GET', '/path'` before it, or `method: 'POST'` shortly after. */
function methodAt(source, index, end) {
  const before = source.slice(Math.max(0, index - 40), index)
  const m1 = before.match(/['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*[`'"]?$/)
  if (m1) return m1[1]
  const after = source.slice(end, end + 240)
  const m2 = after.match(/^[^;]*?method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/)
  if (m2) return m2[1]
  return 'GET'
}

const PATTERNS = {
  ebay: [/\/(?:sell|commerce|post-order|buy|developer|identity)\/[A-Za-z0-9_{}$().,\-/]+/g],
  tiktok_shop: [/\/[a-z_]+\/20\d{4}\/[A-Za-z0-9_{}$().,\-/]+/g],
}

/** @returns {Array<{ id: string, files: string[] }>} */
function usedEndpoints(key) {
  const found = new Map()
  const add = (id, file) => {
    const rel = path.relative(BACKEND, file).split(path.sep).join('/')
    if (!found.has(id)) found.set(id, new Set())
    found.get(id).add(rel)
  }
  for (const file of files(key)) {
    const source = fs.readFileSync(file, 'utf8')
    const lines = source.split('\n')
    const isComment = (index) => {
      const line = lines[source.slice(0, index).split('\n').length - 1]
      return /^\s*(\*|\/\/|\/\*)/.test(line)
    }
    for (const pattern of PATTERNS[key] || []) {
      for (const m of source.matchAll(pattern)) {
        if (isComment(m.index)) continue
        const p = cleanPath(m[0])
        if (p.split('/').length < 4) continue
        add(`${methodAt(source, m.index, m.index + m[0].length)} ${p}`, file)
      }
    }
    if (key === 'ebay') {
      for (const m of source.matchAll(/['"]((?:Get|Add|Revise|End|Relist|Set|Complete|Verify|Respond|Upload|Leave|Delete|Review)[A-Z][A-Za-z]+)['"]/g)) {
        if (!isComment(m.index) && /trading|Trading|callTrading|xml|Request/.test(source)) add(`Trading:${m[1]}`, file)
      }
    }
    if (key === 'temu') {
      for (const m of source.matchAll(/['"]((?:bg|temu)\.[a-zA-Z0-9.]+)['"]/g)) if (!isComment(m.index)) add(m[1], file)
    }
  }
  return [...found].map(([id, set]) => ({ id, files: [...set].sort() })).sort((a, b) => a.id.localeCompare(b.id))
}

/** Comparable form of an endpoint id: method upper-cased, every path parameter `{}`. */
function normalizeId(id) {
  const [first, ...rest] = String(id).trim().split(' ')
  if (!rest.length) return first
  const method = METHODS.includes(first.toUpperCase()) ? first.toUpperCase() : first
  // Path parameters (named or a literal number, e.g. eBay US category tree 0) compare equal.
  return `${method} ${rest.join(' ').replace(/\{[^}]*\}/g, '{}').replace(/\/\d+(?=\/|$)/g, '/{}')}`
}

module.exports = { usedEndpoints, normalizeId, cleanPath }

if (require.main === module) {
  for (const key of ['ebay', 'tiktok_shop', 'temu']) {
    console.log(`== ${key}`)
    for (const e of usedEndpoints(key)) console.log(`${e.id}  (${e.files.join(', ')})`)
  }
}
