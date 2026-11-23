// Builds docs/api-coverage/catalog/tiktok_shop.json from the OpenAPI 3.1 spec generated from TikTok
// Shop Partner Center's API reference (https://github.com/isaackogan/TikTok-Shop-Api-SDKs,
// .openapi/tiktok-shop.openapi.json). Every endpoint keeps its official docs page as `docs`.
// Only the latest version of each endpoint is listed (the comparer matches older versions we call).
// usage: node build-tiktok-catalog.js <spec.json> <outFile>
const fs = require('fs')
const path = require('path')
const [specFile, out] = process.argv.slice(2)
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'))
// APIs for creators and affiliate partner agencies, not for a seller's own shop.
const NOT_SELLER = /^\/(affiliate_creator|affiliate_partner)\//
const firstSentence = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0].slice(0, 220)
const latest = new Map()
for (const [p, ops] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
    const version = (p.match(/\/(20\d{4})\//) || [])[1] || ''
    const key = `${method.toUpperCase()} ${p.replace(/\/20\d{4}\//, '/{v}/')}`
    const prev = latest.get(key)
    if (prev && prev.version >= version) continue
    latest.set(key, {
      version,
      row: {
        id: `${method.toUpperCase()} ${p}`,
        group: (op.tags && op.tags[0]) || p.split('/')[1],
        name: op.summary || op.operationId,
        summary: firstSentence(op.description) || op.summary || op.operationId,
        scope: (op['x-tts-scopes'] || []).join(', '),
        sellerFacing: !NOT_SELLER.test(p),
        confirmed: true,
        ...(op['x-tts-docs-url'] ? { docs: op['x-tts-docs-url'] } : {}),
      },
    })
  }
}
const endpoints = [...latest.values()].map((v) => v.row).sort((a, b) => a.id.localeCompare(b.id))
const catalog = {
  shop: 'tiktok_shop',
  sources: ['https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview', 'https://github.com/isaackogan/TikTok-Shop-Api-SDKs'],
  researchedAt: new Date().toISOString().slice(0, 10),
  notes: [
    `Built from the OpenAPI spec generated from the Partner Center API reference (spec version ${spec.info?.version}); each endpoint's "docs" is its official page.`,
    'Latest version of each endpoint only. Affiliate creator and affiliate partner APIs are listed as not for sellers.',
    `Webhook topics (${Object.keys(spec.webhooks || {}).length}) are events TikTok sends, not endpoints; the Event API (subscribe/list/delete) is listed.`,
  ],
  endpoints,
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`)
const by = {}
for (const e of endpoints) by[e.group] = (by[e.group] || 0) + 1
console.log(endpoints.length, 'endpoints', by)
