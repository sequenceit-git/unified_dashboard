import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/price-reviews/pricesView.js')
test.after(() => server.close())

const SECTION = { tables: [
  { id: 'pricing', rows: [{ id: '1', difference: 20 }, { id: '2', difference: -5 }, { id: '3', difference: 4 }] },
  { id: 'reviews', rows: [{ id: 'A', waiting: true }, { id: 'B', waiting: false }, { id: 'C', waiting: true }] },
  { id: 'catalog', rows: [{ goods: 'x' }] },
] }

test('price review pills, summary and needs attention', async () => {
  const { pricePills, priceSummary, priceAttention, priceCounts } = await load()
  const c = priceCounts(SECTION)
  assert.deepEqual(c, { waiting: 2, reviews: 3, above: 2, guide: 3, goods: 1 })
  assert.deepEqual(pricePills(c).map((p) => [p.key, p.count]), [['waiting', 2], ['reviews', 3], ['guide', 3], ['current', 1]])
  assert.equal(priceSummary(c), '2 waiting for you · 2 SKUs priced above Temu')
  assert.deepEqual(priceAttention(c).map((i) => [i.text, i.pill]), [['2 price reviews waiting for your answer', 'waiting'], ['2 SKUs priced above Temu’s recommendation', 'guide']])
  const failed = priceCounts({ tables: [{ id: 'reviews', rows: [], error: 'no permission' }] })
  assert.equal(failed.waiting, null)
  assert.deepEqual(priceAttention(failed), [])
})
