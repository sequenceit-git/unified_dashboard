import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/after-sales/returnsView.js')
test.after(() => server.close())

const NOW = new Date(2026, 10, 25, 12, 0)
const at = (d) => new Date(2026, 10, d, 12, 0).toISOString()
const RETURNS = [
  { id: 'A', status: 'Requested', respondBy: at(26) },
  { id: 'B', status: 'Package shipped', respondBy: at(24) },
  { id: 'C', status: 'Platform reviewing', respondBy: at(30) },
  { id: 'D', status: 'Refunded' },
  { id: 'E', status: 'Rejected' },
]
const CANCELS = [{ cancelId: 'X', status: 'Pending' }, { cancelId: 'Y', status: 'Approved' }]

test("what Temu lets the app do: approve open returns (not while Temu reviews) and open cancellations", async () => {
  const { canApproveReturn, canApproveCancel } = await load()
  assert.deepEqual(RETURNS.map((r) => canApproveReturn(r.status)), [true, true, false, false, false])
  assert.deepEqual(CANCELS.map((c) => canApproveCancel(c.status)), [true, false])
})

test('pills, needs attention and respond-by', async () => {
  const { returnPills, returnsAttention, respondText, sortOpenFirst } = await load()
  assert.deepEqual(returnPills(RETURNS, CANCELS).map((p) => [p.key, p.count]), [['open', 3], ['cancellations', 1], ['closed', 2], ['all', 5]])
  assert.deepEqual(returnsAttention(RETURNS, CANCELS, NOW).map((i) => [i.text, i.pill]), [['1 overdue for your answer', 'open'], ['1 due within 2 days', 'open'], ['1 cancellation request waiting', 'cancellations']])
  assert.deepEqual(respondText({ status: 'Requested', respondBy: at(26) }, NOW), { text: 'in 1 day', late: false })
  assert.deepEqual(respondText({ status: 'Package shipped', respondBy: at(24) }, NOW), { text: 'overdue 1 day', late: true })
  assert.equal(respondText({ status: 'Refunded', respondBy: at(24) }, NOW), null)
  assert.deepEqual(sortOpenFirst(RETURNS).map((r) => r.id), ['B', 'A', 'C', 'D', 'E'])
})
