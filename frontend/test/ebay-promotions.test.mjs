import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/promotions/promotionsView.js')
test.after(() => server.close())

const SECTION = { tables: [
  { id: 'promotions', rows: [
    { id: '1', promotionId: 1, name: 'Spring', status: 'Running', type: 'Order discount' },
    { id: '2', promotionId: 2, name: 'Sale', status: 'Scheduled', type: 'Markdown sale' },
    { id: '3', promotionId: 3, name: 'Old', status: 'Ended', type: 'Order discount' },
    { id: '4', promotionId: 4, name: 'Held', status: 'Paused', type: 'Order discount' },
  ] },
  { id: 'results', rows: [{ promotionId: 1, orders: 4, items: 6, promotionSales: { value: 80, currency: 'USD' } }] },
] }

test('promotions by state, results inline', async () => {
  const { promotionRows, promotionPills } = await load()
  const rows = promotionRows(SECTION)
  assert.deepEqual(rows.map((r) => r.state), ['running', 'scheduled', 'ended', 'paused'])
  assert.equal(rows[0].result.orders, 4)
  assert.equal(rows[1].result, null)
  assert.deepEqual(promotionPills(rows).map((p) => [p.key, p.count]), [['running', 1], ['scheduled', 1], ['paused', 1], ['ended', 1], ['all', 4]])
  assert.equal(promotionRows({ tables: [{ id: 'promotions', rows: [], error: 'x' }] }), null)
})

test('pause / resume only where eBay allows it (not markdown sales)', async () => {
  const { promotionRows, pauseAction } = await load()
  const rows = promotionRows(SECTION)
  assert.deepEqual(rows.map((r) => pauseAction(r)?.verb ?? null), ['pause', null, null, 'resume'])
})

test('new promotion checks, per step', async () => {
  const { newPromotionProblems } = await load()
  const now = new Date('2026-11-25T12:00:00Z')
  const ok = { discount: '15', wholeStore: false, listingIds: ['111'], start: '2026-11-26T00:00', end: '2026-12-10T00:00' }
  assert.deepEqual(newPromotionProblems(ok, now), [])
  assert.deepEqual(newPromotionProblems({ ...ok, discount: '3', listingIds: [], end: '' }, now).map((p) => p.step), ['discount', 'listings', 'dates'])
  assert.deepEqual(newPromotionProblems({ ...ok, wholeStore: true, listingIds: [] }, now), [])
  assert.match(newPromotionProblems({ ...ok, end: '2026-11-25T00:00' }, now)[0].message, /after the start/)
})

test('drafts are their own state (under Scheduled); Pause only while running', async () => {
  const { promotionRows, pauseAction, promotionPills } = await load()
  const rows = promotionRows({ tables: [{ id: 'promotions', rows: [
    { id: '5', promotionId: 5, status: 'Draft', type: 'Order discount' },
    { id: '6', promotionId: 6, status: 'Scheduled', type: 'Order discount' },
  ] }] })
  assert.deepEqual(rows.map((r) => r.state), ['draft', 'scheduled'])
  assert.deepEqual(rows.map((r) => pauseAction(r)), [null, null])
  assert.equal(promotionPills(rows).find((p) => p.key === 'scheduled').count, 2)
})

test('results with no promotion in the list are kept', async () => {
  const { otherResults } = await load()
  assert.deepEqual(otherResults({ tables: [
    { id: 'promotions', rows: [{ promotionId: 1 }] },
    { id: 'results', rows: [{ promotionId: 1 }, { promotionId: 9, name: 'Deleted sale' }] },
  ] }).map((r) => r.promotionId), [9])
})

test('a start already past moves to just after now; the sale runs at least 24 hours', async () => {
  const { newPromotionProblems, effectiveStart } = await load()
  const now = new Date('2026-11-25T12:00:00Z')
  assert.equal(effectiveStart('2026-11-25T11:00:00Z', now).toISOString(), '2026-11-25T12:02:00.000Z')
  assert.equal(effectiveStart('2026-11-26T00:00:00Z', now).toISOString(), '2026-11-26T00:00:00.000Z')
  const p = newPromotionProblems({ discount: '10', wholeStore: true, listingIds: [], start: '2026-11-25T11:00:00Z', end: '2026-11-25T20:00:00Z' }, now)
  assert.match(p[0].message, /24 hours/)
})
