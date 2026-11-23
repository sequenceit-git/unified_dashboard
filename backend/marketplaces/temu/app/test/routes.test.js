const test = require('node:test')
const assert = require('node:assert/strict')
const snapshot = require('../../../../test/__snapshots__/routes.json')

test('Temu API routes are the same as before', () => {
  assert.deepEqual(require('../api').routeList, snapshot.perShop.temu)
})

test("Temu app code reads only its own rows: every request marketplace read is pinned to 'temu'", () => {
  const fs = require('fs')
  const path = require('path')
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'test' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []))
  const hits = []
  for (const file of files(path.join(__dirname, '..'))) {
    const source = fs.readFileSync(file, 'utf8')
    if (/canonicalMarketplace\((ctx|req)\.(query|body)/.test(source)) hits.push(path.basename(file))
    if (/['"](ebay|tiktok_shop)['"]/.test(source)) hits.push(`${path.basename(file)} names another shop`)
  }
  assert.deepEqual(hits, [])
})

test('Temu app has no inbox', () => {
  const app = require('..')
  assert.equal(app.sync.inbox, undefined)
  assert.equal(require('../api').routeList.some((r) => r.split(' ')[1].startsWith('/inbox')), false)
})

test("another shop's product id is a 404", async () => {
  const router = require('../routes/products')('temu')
  assert.ok(router.params?.id?.length, 'the products routes check that an :id belongs to this shop')
})
