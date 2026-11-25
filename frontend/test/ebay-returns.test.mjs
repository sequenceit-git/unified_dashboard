import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/returns-cases/returnsView.js')
test.after(() => server.close())

const NOW = new Date('2026-11-25T12:00:00Z')
const at = (d) => new Date(Date.UTC(2026, 10, d, 12)).toISOString()
const ACT = [{ id: 'return', detail: true }, { id: 'refund', label: 'Refund' }]
const SECTION = { tables: [
  { id: 'returns', rows: [
    { id: 'R1', returnId: 'R1', status: 'Return requested', respondBy: at(27), actions: ACT },
    { id: 'R2', returnId: 'R2', status: 'Closed', actions: [{ id: 'return', detail: true }] },
    { id: 'R3', returnId: 'R3', status: 'Item shipped', respondBy: at(24), actions: ACT },
  ] },
  { id: 'cancellations', rows: [{ cancelId: 'C1', status: 'Cancel requested' }, { cancelId: 'C2', status: 'Cancel closed with refund' }] },
  { id: 'inquiries', rows: [], error: 'no access' },
  { id: 'cases', rows: [{ id: 'K1', status: 'Closed', actions: [{ id: 'case', detail: true }] }] },
  { id: 'disputes', rows: [{ id: 'D1', status: 'Action needed', respondBy: at(26), actions: [{ id: 'dispute', detail: true }, { id: 'dispute-accept', label: 'Accept' }] }] },
] }

test('kinds with rows: cancellations get an id; failed kinds have no count', async () => {
  const { kindsOf } = await load()
  const k = kindsOf(SECTION)
  assert.deepEqual(k.map((x) => [x.key, x.count, x.open]), [['returns', 3, 2], ['cancellations', 2, 1], ['inquiries', null, null], ['cases', 1, 0], ['disputes', 1, 1]])
  assert.equal(k[1].rows[0].id, 'C1')
  assert.equal(k[2].error, 'no access')
})

test('rows by deadline (overdue first), open ones before closed; respond-by text', async () => {
  const { kindsOf, respondText } = await load()
  assert.deepEqual(kindsOf(SECTION)[0].rows.map((r) => r.id), ['R3', 'R1', 'R2'])
  assert.deepEqual(respondText({ respondBy: at(24) }, NOW), { text: 'overdue 1 day', late: true })
  assert.deepEqual(respondText({ respondBy: at(27) }, NOW), { text: 'in 2 days', late: false })
  assert.equal(respondText({}, NOW), null)
})

test('summary: how many need a reply and the next deadline', async () => {
  const { kindsOf, summaryLine } = await load()
  assert.equal(summaryLine(kindsOf(SECTION), NOW), '4 need a reply · 1 overdue · next deadline in 1 day')
})

test('main action: Approve for open returns and cancellations, Respond when there is something to do, else Details', async () => {
  const { kindsOf, mainAction } = await load()
  const k = kindsOf(SECTION)
  assert.equal(mainAction(k[0].rows[1], 'returns').label, 'Approve')
  assert.equal(mainAction(k[0].rows[2], 'returns').label, 'Details')
  assert.equal(mainAction(k[1].rows[0], 'cancellations').label, 'Approve')
  assert.equal(mainAction(k[1].rows[1], 'cancellations').label, 'Details')
  assert.equal(mainAction(k[4].rows[0], 'disputes').label, 'Respond')
})

test("the drawer's own decide actions per kind", async () => {
  const { decideActions } = await load()
  assert.deepEqual(decideActions({ status: 'Return requested' }, 'returns').map((a) => a.id), ['return-approve', 'return-decline'])
  assert.deepEqual(decideActions({ status: 'Cancel requested' }, 'cancellations').map((a) => a.id), ['cancel-approve', 'cancel-reject'])
  assert.deepEqual(decideActions({ status: 'Closed' }, 'returns'), [])
})
