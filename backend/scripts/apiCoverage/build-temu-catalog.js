// Builds docs/api-coverage/catalog/temu.json from the Temu Partner Platform API reference, as
// mirrored daily from partner.temu.com by https://github.com/opastorello/temu-api-docs
// (api-reference/<group>/<method>.md). The official reference needs a signed-in browser, so the
// mirror is the public copy. A method the dashboard calls that the mirror lacks is added with
// confirmed:false ("confirm in partner account"). usage: node build-temu-catalog.js <repoDir> <outFile>
const fs = require('fs')
const path = require('path')
const { usedEndpoints } = require('./used')
const [repo, out] = process.argv.slice(2)
const ref = path.join(repo, 'api-reference')
const GROUPS = { ads: 'Ads', authorization: 'Authorization', compliance: 'Compliance', flash: 'Flash (real images)', order: 'Order', other: 'Order verification', product: 'Product', promotions: 'Promotions', returns: 'Returns and after-sales', shipping: 'Shipping', warehouse: 'Warehouse', webhook: 'Webhook' }
const endpoints = []
for (const dir of fs.readdirSync(ref).sort()) {
  for (const file of fs.readdirSync(path.join(ref, dir)).filter((f) => /^(bg|temu)\..+\.md$/.test(f)).sort()) {
    const text = fs.readFileSync(path.join(ref, dir, file), 'utf8')
    const id = file.replace(/\.md$/, '')
    if (endpoints.some((e) => e.id === id)) continue // a few methods are filed under two groups
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const title = (lines.find((l) => /^\*\*[^*]+\*\*$/.test(l)) || '').replace(/\*\*/g, '')
    const desc = lines.find((l, i) => i > 1 && !/^[#*|`-]/.test(l)) || ''
    endpoints.push({ id, group: GROUPS[dir] || dir, name: title || id, summary: (desc || title || id).slice(0, 220), scope: '', sellerFacing: true, confirmed: true })
  }
}
for (const { id } of usedEndpoints('temu')) {
  if (!endpoints.some((e) => e.id === id)) endpoints.push({ id, group: 'Not in the public reference', name: id, summary: 'Called by the dashboard but not in the public reference: confirm in partner account.', scope: '', sellerFacing: true, confirmed: false })
}
const catalog = {
  shop: 'temu',
  sources: ['https://partner.temu.com/documentation', 'https://partner-us.temu.com/documentation', 'https://github.com/opastorello/temu-api-docs'],
  researchedAt: new Date().toISOString().slice(0, 10),
  notes: [
    'The official reference needs a signed-in partner account; this list comes from its public daily mirror (global partner portal). Regional portals (US, EU) can differ: entries marked confirmed:false need checking in the partner account.',
    'All Temu calls are POST to the regional router (e.g. https://openapi-b-us.temu.com/openapi/router) with the method name as "type"; ids are the method names.',
  ],
  endpoints,
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`)
const by = {}
for (const e of endpoints) by[e.group] = (by[e.group] || 0) + 1
console.log(endpoints.length, 'endpoints', by, 'unconfirmed', endpoints.filter((e) => !e.confirmed).map((e) => e.id))
