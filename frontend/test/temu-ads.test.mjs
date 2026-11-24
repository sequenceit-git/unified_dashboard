import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/ads/adsView.js')
test.after(() => server.close())

const $ = (value) => ({ value, currency: 'USD' })
const ROWS = [
  { id: '1', spend: $(20), sales: $(10), orders: 1, roas: 0.5 },
  { id: '2', spend: $(5), sales: $(0), orders: 0, roas: 0 },
  { id: '3', spend: $(10), sales: $(60), orders: 4, roas: 6 },
  { id: '4', spend: $(0), sales: $(0), orders: 0, roas: null },
]

test('needs attention: ads earning less than they spend, ads with spend and no orders', async () => {
  const { adsAttention } = await load()
  assert.deepEqual(adsAttention(ROWS).map((i) => [i.id, i.text]), [
    ['losing', '2 ads earn less than they spend (ROAS under 1)'],
    ['noOrders', '1 ad spent with no orders in 30 days'],
  ])
  assert.deepEqual(adsAttention(null), [])
})

test('sorting: highest spend first; ROAS tone', async () => {
  const { bySpend, roasTone } = await load()
  assert.deepEqual(bySpend(ROWS).map((r) => r.id), ['1', '3', '2', '4'])
  assert.deepEqual([roasTone(0.5), roasTone(1.5), roasTone(4), roasTone(null)], ['bad', 'ok', 'good', ''])
})

test('Temu Ads not on for the shop vs a real error', async () => {
  const { adsOff } = await load()
  assert.equal(adsOff({ error: 'Your Temu connection does not allow temu.searchrec.ad.reports.mall.query' }), true)
  assert.equal(adsOff({ error: 'The mall has not opened advertising' }), true)
  assert.equal(adsOff({ error: 'Temu timed out' }), false)
  assert.equal(adsOff(undefined), false)
})
