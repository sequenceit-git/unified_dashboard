const test = require('node:test')
const assert = require('node:assert/strict')
const snapshot = require('../../../../test/__snapshots__/routes.json')

test('eBay API routes are the same as before', () => {
  assert.deepEqual(require('../api').routeList, snapshot.perShop.ebay)
})

test("eBay app code reads only eBay rows: every request marketplace read is pinned to 'ebay'", () => {
  const fs = require('fs')
  const path = require('path')
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'test' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []))
  const hits = []
  for (const file of files(path.join(__dirname, '..'))) {
    const source = fs.readFileSync(file, 'utf8')
    if (/canonicalMarketplace\((ctx|req)\.(query|body)/.test(source)) hits.push(path.basename(file))
    if (/['"](tiktok_shop|temu)['"]/.test(source)) hits.push(`${path.basename(file)} names another shop`)
  }
  assert.deepEqual(hits, [])
})
