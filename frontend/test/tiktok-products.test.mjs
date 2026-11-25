import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/tiktok_shop/sections/products/listView.js')
test.after(() => server.close())

const COUNTS = { all: 212, live: 180, unlisted: 20, out_of_stock: 3, paused: 4, ended: 3, error: 2, pending: 0, suspended: 0 }

test('status pills carry counts and the listing filter they ask for; pending only when there are some', async () => {
  const { statusPills } = await load()
  const pills = statusPills(COUNTS)
  assert.deepEqual(pills.map((p) => [p.key, p.label, p.count, p.listing]), [
    ['all', 'All', 212, 'all'], ['live', 'Live', 180, 'live'], ['unlisted', 'Not listed', 20, 'unlisted'],
    ['out_of_stock', 'Out of stock', 3, 'out_of_stock'], ['paused', 'Deactivated', 4, 'paused'], ['ended', 'Deleted', 3, 'ended'], ['error', 'Problems', 2, 'error'],
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
  assert.deepEqual(attentionItems({ ...COUNTS, error: 0, out_of_stock: 0, suspended: 1 }).map((i) => [i.text, i.pill]), [['1 suspended or frozen by TikTok', 'paused']])
})

test('each row gets one main action for what to do next', async () => {
  const { mainAction } = await load()
  assert.equal(mainAction({ shopListing: null }).id, 'list')
  assert.equal(mainAction({ shopListing: { status: 'live' } }).id, 'edit')
  assert.equal(mainAction({ shopListing: { status: 'pending' } }).id, 'edit')
  assert.equal(mainAction({ shopListing: { status: 'out_of_stock' } }).id, 'restock')
  assert.equal(mainAction({ shopListing: { status: 'out_of_stock' } }, { canRestock: false }).id, 'edit', 'no stock access: change stock in the product form')
  assert.equal(mainAction({ shopListing: { status: 'error' } }).id, 'fix')
  // TikTok's own listing actions: Recover a deleted product, Publish a draft or deactivated one.
  const recover = { id: 'recover', label: 'Recover listing' }
  const publish = { id: 'publish', label: 'Publish' }
  const del = { id: 'delete', label: 'Delete listing', danger: true }
  assert.deepEqual(mainAction({ shopListing: { status: 'ended' } }, { shopActions: [recover] }), { id: 'shop', label: 'Recover listing', action: recover })
  assert.equal(mainAction({ shopListing: { status: 'paused' } }, { shopActions: [publish, del] }).action, publish)
  // Suspended or frozen by TikTok: no action applies, so Edit.
  assert.equal(mainAction({ shopListing: { status: 'paused' } }, { shopActions: [] }).id, 'edit')
})

test("TikTok's product id from a listing id; the shop's own list wording", async () => {
  const { itemId, mainAction } = await load()
  assert.equal(itemId('1729384756102938475:17293'), '1729384756102938475')
  assert.equal(itemId(null), '')
  assert.equal(mainAction({}, { listLabel: 'Publish to TikTok Shop' }).label, 'Publish to TikTok Shop')
})
