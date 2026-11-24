import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/tiktok_shop/sections/analytics/analyticsView.js')
test.after(() => server.close())

const day = (date, o = {}) => ({ date, gmv: 0, orders: 0, items: 0, refunds: null, customers: null, pageViews: null, visitors: null, conversion: null, channels: null, ...o })

test('periods are whole days ending at the last day with data, never overlapping', async () => {
  const { PERIODS, periodRanges, change, pointsChange } = await load()
  assert.deepEqual(PERIODS.map((p) => p.value), ['7', '30', '60', '90'])
  assert.deepEqual(periodRanges(7, '2026-11-23'), { current: { from: '2026-11-17', to: '2026-11-23' }, previous: { from: '2026-11-10', to: '2026-11-16' } })
  assert.deepEqual(periodRanges(30, '2026-03-01').previous, { from: '2026-01-01', to: '2026-01-30' })
  assert.equal(change(110, 100), 10)
  assert.equal(change(5, 0), null)
  assert.equal(change(5, undefined), null)
  assert.equal(change(50, -100), 150)
  assert.equal(pointsChange(2.5, 2.2), 0.3)
  assert.equal(pointsChange(null, 2.2), null)
})

test('totals: averages only over days TikTok has data for; conversion as a percent', async () => {
  const { totals } = await load()
  const t = totals([
    day('2026-11-20', { gmv: 100, orders: 4, refunds: 8, visitors: 120, conversion: 0.025 }),
    day('2026-11-21', { gmv: 50, orders: 1, refunds: 2, visitors: 80, conversion: '0.0215' }),
    day('2026-11-22', { gmv: 10, orders: 1 }),
  ])
  assert.deepEqual(t, { gmv: 160, orders: 6, avgOrder: 26.67, refunds: 10, visitorsPerDay: 100, conversion: 2.3 })
  assert.deepEqual(totals([day('2026-11-20', { gmv: 5, orders: 1 })]), { gmv: 5, orders: 1, avgOrder: 5, refunds: null, visitorsPerDay: null, conversion: null })
  assert.deepEqual(totals(null), { gmv: 0, orders: 0, avgOrder: 0, refunds: null, visitorsPerDay: null, conversion: null })
})

test('channel share sums to 100 and is null without channel data', async () => {
  const { channelShare } = await load()
  const s = channelShare([day('a', { channels: { video: 60, live: 10, productCard: 30 } }), day('b', { channels: { video: 40, live: 10, productCard: 50 } })])
  assert.deepEqual(s.map((c) => [c.key, c.label, c.amount, c.share]), [['video', 'Video', 100, 50], ['productCard', 'Product card', 80, 40], ['live', 'LIVE', 20, 10]])
  assert.equal(channelShare([day('a')]), null)
  assert.equal(channelShare([day('a', { channels: { video: 0, live: 0, productCard: 0 } })]), null)
})

test('the previous period lines up by day index', async () => {
  const { withPrevious } = await load()
  const rows = withPrevious([day('2026-11-19', { gmv: 10 })], [day('2026-11-16', { gmv: 4 })], 3, '2026-11-18')
  assert.deepEqual(rows, [{ date: '2026-11-18', gmv: 0, prevGmv: 0 }, { date: '2026-11-19', gmv: 10, prevGmv: 4 }, { date: '2026-11-20', gmv: 0, prevGmv: 0 }])
})

test('shop health: problems are metrics whose status is not a good one', async () => {
  const { healthView, needsWork } = await load()
  assert.equal(needsWork('Excellent'), false)
  assert.equal(needsWork('Good'), false)
  assert.equal(needsWork('Needs work'), true)
  assert.equal(needsWork(''), false)
  assert.equal(needsWork('Not good'), true)
  assert.equal(needsWork('Does not meet'), true)
  assert.equal(needsWork("Doesn't meet"), true)
  assert.equal(needsWork('Good', 'POOR'), true)
  assert.equal(needsWork('', 'EXCELLENT'), false)
  const v = healthView({
    summary: [{ id: 'sps-score', value: '4.2', sub: 'Good' }, { id: 'peers', value: '72%' }, { id: 'benefits', value: '3 of 5' }],
    tables: [{ id: 'health', rows: [{ id: 'OTDR', metric: 'Late dispatch rate', value: '4.1%', target: '2%', status: 'Needs work', reason: 'Mondays' }, { id: 'NRR', metric: 'Negative reviews', value: '0.5%', status: 'Excellent' }] }],
  })
  assert.deepEqual([v.score, v.tier, v.peers, v.benefits], ['4.2', 'Good', '72%', '3 of 5'])
  assert.deepEqual(v.problems.map((p) => p.id), ['OTDR'])
  assert.equal(v.allGood, false)
  assert.equal(healthView({ summary: [], tables: [{ id: 'health', rows: [], error: 'no scope' }] }).error, 'no scope')
  assert.equal(healthView(null).allGood, false)
})
