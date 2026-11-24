import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/analytics/analyticsView.js')
test.after(() => server.close())

test('periods are whole days ending on the given day', async () => {
  const { periodRanges, yesterday, PERIODS } = await load()
  assert.deepEqual(PERIODS.map((p) => p.value), ['7', '30', '60', '90'])
  assert.deepEqual(periodRanges(7, '2026-11-23'), { current: { from: '2026-11-17', to: '2026-11-23' }, previous: { from: '2026-11-10', to: '2026-11-16' } })
  assert.equal(yesterday(new Date('2026-11-24T20:00:00Z')), '2026-11-23')
  // 02:00 on Nov 24 in Dhaka is still Nov 23 in Pacific time: yesterday there is Nov 22.
  assert.equal(yesterday(new Date('2026-11-23T20:00:00Z')), '2026-11-22')
})

test('change, points and margin', async () => {
  const { change, pointsChange, margin } = await load()
  assert.equal(change(110, 100), 10)
  assert.equal(change(5, 0), null)
  assert.equal(change(50, -100), 150)
  assert.equal(pointsChange(2.5, 2.2), 0.3)
  assert.equal(pointsChange(null, 1), null)
  assert.equal(margin(25, 100), 25)
  assert.equal(margin(5, 0), null)
})

test('traffic totals: click-through and conversion over the whole period', async () => {
  const { trafficTotals } = await load()
  assert.deepEqual(trafficTotals([{ impressions: 500, views: 20, sold: 1 }, { impressions: 300, views: 20, sold: 1 }]), { impressions: 800, views: 40, sold: 2, ctr: 5, conversion: 5 })
  assert.deepEqual(trafficTotals([]), { impressions: 0, views: 0, sold: 0, ctr: null, conversion: null })
  assert.deepEqual(trafficTotals(null), { impressions: 0, views: 0, sold: 0, ctr: null, conversion: null })
})

test('revenue lines up with the previous period by day index', async () => {
  const { withPrevious } = await load()
  assert.deepEqual(withPrevious([{ date: '2026-11-19', revenue: 10 }], [{ date: '2026-11-16', revenue: 4 }], 3, '2026-11-18'), [
    { date: '2026-11-18', revenue: 0, prevRevenue: 0 }, { date: '2026-11-19', revenue: 10, prevRevenue: 4 }, { date: '2026-11-20', revenue: 0, prevRevenue: 0 },
  ])
})

test('"seen, rarely clicked": 100+ impressions and click-through under half the shop', async () => {
  const { rarelyClicked } = await load()
  const rows = [{ listingId: 'a', impressions: 1000, views: 5 }, { listingId: 'b', impressions: 1000, views: 100 }, { listingId: 'c', impressions: 50, views: 0 }]
  // shop click-through = 105 / 2050 ≈ 5.1%; a = 0.5% (flag), b = 10%, c has too few impressions
  assert.deepEqual([...rarelyClicked(rows)], ['a'])
  assert.deepEqual([...rarelyClicked([])], [])
})

test('needs attention: below standard, worse than similar sellers, stock; never "All good" on a failed check', async () => {
  const { attentionItems, attentionStatus } = await load()
  const items = attentionItems({
    standards: [{ id: 'PROGRAM_US|CURRENT', program: 'US', cycle: 'Current', levelCode: 'BELOW_STANDARD', level: 'Below Standard' }, { id: 'x', levelCode: 'TOP_RATED' }],
    service: [{ metric: 'Not received', category: 'Clothing', ratingCode: 'VERY_HIGH' }, { metric: 'Not as described', category: 'Shoes', ratingCode: 'AVERAGE' }],
    inventory: { lowCount: 5, outCount: 1 },
  })
  assert.deepEqual(items.map((i) => i.id), ['level:PROGRAM_US|CURRENT', 'service:Not received:Clothing', 'stock'])
  assert.equal(items[0].text, 'Seller level: Below Standard (US, Current)')
  assert.deepEqual(items[0].detail, { action: 'standards', id: 'PROGRAM_US|CURRENT' })
  assert.equal(items[1].text, '"Not received" rate higher than similar sellers (Clothing)')
  assert.equal(items[2].text, '4 low stock, 1 out of stock')
  assert.equal(items[2].to, '/ebay/inventory')
  assert.deepEqual(attentionItems({ standards: null, service: null, inventory: null }), [])
  assert.equal(attentionStatus({ items: [], loading: false, error: 'x' }), 'error')
  assert.equal(attentionStatus({ items: [], loading: false, error: '' }), 'all-good')
  assert.equal(attentionStatus({ items: [{}], loading: true, error: '' }), 'problems')
})

test('traffic days fill gaps with zero across the period', async () => {
  const { fillDays } = await load()
  assert.deepEqual(fillDays([{ date: '2026-11-18', impressions: 5, views: 1, sold: 0 }], '2026-11-17', '2026-11-19'), [
    { date: '2026-11-17', impressions: 0, views: 0, sold: 0 },
    { date: '2026-11-18', impressions: 5, views: 1, sold: 0 },
    { date: '2026-11-19', impressions: 0, views: 0, sold: 0 },
  ])
  assert.deepEqual(fillDays(null, '2026-11-17', '2026-11-17'), [{ date: '2026-11-17', impressions: 0, views: 0, sold: 0 }])
})
