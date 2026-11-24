import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/analytics/analyticsView.js')
test.after(() => server.close())

const dayStart = (s) => { const d = new Date(`${s}T00:00:00`); return d }

test('periods: the current days and the same number of days before them', async () => {
  const { periodRanges, PERIODS } = await load()
  assert.deepEqual(PERIODS.map((p) => p.value), ['7', '30', '60', '90'])
  const r = periodRanges(7, new Date('2026-11-24T15:00:00'))
  assert.equal(r.current.from, dayStart('2026-11-18').toISOString())
  assert.equal(new Date(r.previous.to).getTime(), dayStart('2026-11-18').getTime() - 1)
  assert.equal(r.previous.from, dayStart('2026-11-11').toISOString())
})

test('change and margin give null instead of infinity', async () => {
  const { change, margin } = await load()
  assert.equal(change(110, 100), 10)
  assert.equal(change(90, 100), -10)
  assert.equal(change(5, 0), null)
  assert.equal(change(0, 0), null)
  assert.equal(change(50, -100), 150)
  assert.equal(change(-150, -100), -50)
  assert.equal(margin(25, 100), 25)
  assert.equal(margin(5, 0), null)
})

test('the previous period lines up by day, missing days count 0', async () => {
  const { withPrevious } = await load()
  const rows = withPrevious([{ date: '2026-11-19', revenue: 10, orders: 1 }], [{ date: '2026-11-16', revenue: 4, orders: 1 }], 3, dayStart('2026-11-18').toISOString())
  assert.deepEqual(rows, [
    { date: '2026-11-18', revenue: 0, orders: 0, prevRevenue: 0 },
    { date: '2026-11-19', revenue: 10, orders: 1, prevRevenue: 4 },
    { date: '2026-11-20', revenue: 0, orders: 0, prevRevenue: 0 },
  ])
})

test('needs attention lists only problems that exist, each linking to its page', async () => {
  const { attentionItems } = await load()
  const traffic = [{ goodsId: '1', warning: 'Traffic restricted' }, { goodsId: '2', warning: 'Traffic restricted' }, { goodsId: '3', warning: 'Low traffic' }]
  const items = attentionItems({ traffic, inventory: { lowCount: 5, outCount: 1 }, returnsPer100: 6.2 })
  assert.deepEqual(items.map((i) => i.id), ['restricted', 'low-traffic', 'stock', 'returns'])
  assert.equal(items[0].text, '2 goods traffic-restricted')
  assert.equal(items[0].to, '/temu/goods')
  assert.equal(items[2].text, '4 low stock, 1 out of stock')
  assert.equal(items[2].to, '/temu/inventory')
  assert.equal(items[3].to, '/temu/after-sales')
  assert.ok(!attentionItems({ traffic: [], inventory: { lowCount: 0, outCount: 0 }, returnsPer100: 4 }).some((i) => i.id === 'returns'))
  assert.deepEqual(attentionItems({ traffic: null, inventory: null, returnsPer100: null }), [])
})

test('insights read the loader response, with errors per table', async () => {
  const { insights, trafficByGoods } = await load()
  const v = insights({ summary: [{ id: 'returns-per-100', value: 3 }], tables: [{ id: 'traffic', rows: [], error: 'x' }] })
  assert.equal(v.trafficError, 'x')
  assert.equal(v.tile('returns-per-100'), 3)
  assert.equal(v.tile('ad-spend'), null)
  assert.equal(v.adsShown, false)
  assert.equal(insights(null).adsShown, false)
  assert.equal(insights({ summary: [{ id: 'ad-spend', value: { value: 5 } }], tables: [] }).adsShown, true)
  assert.equal(trafficByGoods([{ goodsId: '7', warning: 'Low traffic' }]).get('7'), 'Low traffic')
})

test('needs attention never says "All good" when a check failed', async () => {
  const { attentionStatus } = await load()
  assert.equal(attentionStatus({ items: [], loading: true, error: '' }), 'loading')
  assert.equal(attentionStatus({ items: [], loading: false, error: 'boom' }), 'error')
  assert.equal(attentionStatus({ items: [{ id: 'stock' }], loading: false, error: 'boom' }), 'problems')
  assert.equal(attentionStatus({ items: [], loading: false, error: '' }), 'all-good')
})
