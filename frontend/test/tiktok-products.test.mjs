import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/tiktok_shop/sections/products/listView.js')
test.after(() => server.close())

const COUNTS = { all: 212, live: 180, unlisted: 20, out_of_stock: 3, ended: 7, error: 2, pending: 0 }

test('status pills carry counts and the listing filter they ask for; pending only when there are some', async () => {
  const { statusPills } = await load()
  const pills = statusPills(COUNTS)
  assert.deepEqual(pills.map((p) => [p.key, p.label, p.count, p.listing]), [
    ['all', 'All', 212, 'all'], ['live', 'Live', 180, 'live'], ['unlisted', 'Not listed', 20, 'unlisted'],
    ['out_of_stock', 'Out of stock', 3, 'out_of_stock'], ['ended', 'Ended', 7, 'closed'], ['error', 'Problems', 2, 'error'],
  ])
  assert.ok(statusPills({ ...COUNTS, pending: 1 }).some((p) => p.key === 'pending'))
  assert.equal(statusPills(null)[0].count, null)
})

test('summary line and needs attention come from the counts', async () => {
  const { summaryLine, attentionItems } = await load()
  assert.equal(summaryLine(COUNTS), '212 products · 180 live · 5 need attention')
  assert.equal(summaryLine({ ...COUNTS, error: 0, out_of_stock: 0 }), '212 products · 180 live')
  assert.equal(summaryLine(null), '')
  assert.deepEqual(attentionItems(COUNTS).map((i) => [i.text, i.pill]), [['2 failed to list', 'error'], ['3 live but out of stock', 'out_of_stock']])
  assert.deepEqual(attentionItems({ ...COUNTS, error: 0, out_of_stock: 0 }), [])
})

test('each row gets one main action for what to do next', async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ shopListing: null }).id, 'list')
  assert.equal(mainAction({ shopListing: { status: 'live' } }).id, 'edit')
  assert.equal(mainAction({ shopListing: { status: 'pending' } }).id, 'edit')
  assert.equal(mainAction({ shopListing: { status: 'out_of_stock' } }).id, 'restock')
  assert.equal(mainAction({ shopListing: { status: 'out_of_stock' } }, { canRestock: false }).id, 'edit', 'no stock access: change stock in the product form')
  assert.equal(mainAction({ shopListing: { status: 'error' } }).id, 'fix')
  assert.equal(mainAction({ shopListing: { status: 'ended' } }).id, 'relist')
  assert.equal(mainAction({ shopListing: { status: 'paused' } }).id, 'relist')
})

test("TikTok's product id from a listing id; the shop's own list wording", async () => {
  const { itemId, mainAction } = await load()
  assert.equal(itemId('1729384756102938475:17293'), '1729384756102938475')
  assert.equal(itemId(null), '')
  assert.equal(mainAction({}, { listLabel: 'Publish to TikTok Shop' }).label, 'Publish to TikTok Shop')
})
