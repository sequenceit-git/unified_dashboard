/**
 * Joins a shop's catalog (docs/api-coverage/catalog/<key>.json) with the endpoints its code calls
 * (used.js) into one row per catalog endpoint:
 *   covered          called at the catalog's version
 *   covered-older    called at an older API version (TikTok /YYYYMM/ paths)
 *   missing          a seller endpoint the dashboard never calls
 *   not-for-sellers  buyer / creator / partner APIs, called or not (never a gap)
 */
const fs = require('fs')
const path = require('path')
const { usedEndpoints, normalizeId } = require('./used')

const DOCS = path.join(__dirname, '..', '..', '..', 'docs', 'api-coverage')
const VERSION = /\/(20\d{4})\//
const versionless = (id) => normalizeId(id).replace(VERSION, '/{v}/')
const pathOnly = (id) => versionless(id).replace(/^[A-Z]+ /, '')
const versionOf = (id) => (String(id).match(VERSION) || [])[1] || ''

function coverage(catalog, used) {
  const endpoints = catalog.endpoints
  const callsFor = new Map(endpoints.map((e) => [e.id, []]))
  for (const call of used) {
    // Method + path first; the extractor guesses GET where the call site doesn't show the method,
    // so a call with no same-method match covers every endpoint at that path.
    let hits = endpoints.filter((e) => versionless(e.id) === versionless(call.id))
    if (!hits.length) hits = endpoints.filter((e) => pathOnly(e.id) === pathOnly(call.id))
    for (const e of hits) callsFor.get(e.id).push(call)
  }
  return endpoints.map((e) => {
    const calls = callsFor.get(e.id)
    const files = [...new Set(calls.flatMap((c) => c.files))].sort()
    const newest = calls.map((c) => c.id).sort((a, b) => versionOf(b).localeCompare(versionOf(a)))[0]
    let status
    if (e.sellerFacing === false) status = 'not-for-sellers'
    else if (!calls.length) status = 'missing'
    else status = versionOf(newest) < versionOf(e.id) ? 'covered-older' : 'covered'
    return {
      id: e.id,
      group: e.group,
      name: e.name,
      summary: e.summary,
      scope: e.scope || '',
      ...(e.docs ? { docs: e.docs } : {}),
      ...(e.retired ? { retired: true } : {}),
      status,
      confirmed: e.confirmed !== false,
      files,
      ...(newest && newest !== e.id ? { calledAs: newest } : {}),
    }
  })
}

const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(DOCS, ...parts), 'utf8'))

/** Coverage rows for a shop from the files in docs/api-coverage/. */
function shopCoverage(key) {
  return coverage(readJson('catalog', `${key}.json`), usedEndpoints(key))
}

module.exports = { coverage, shopCoverage, readJson, DOCS }
