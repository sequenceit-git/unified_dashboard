import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/promotions/promotionsView.js')
test.after(() => server.close())

const NOW = new Date(2026, 10, 25, 12, 0)
const at = (d) => new Date(2026, 10, d, 12, 0).toISOString()
const SECTION = { tables: [
  { id: 'joined', rows: [{ id: '1', name: 'Black Friday', joined: 'Yes', ends: at(28) }, { id: '2', name: 'Old', joined: 'Yes', ends: at(20) }] },
  { id: 'available', rows: [{ id: '1', name: 'Black Friday', joined: 'Yes', ends: at(28) }, { id: '3', name: 'Lightning', joined: '', ends: at(27), actions: [{ id: 'enrol' }] }, { id: '4', name: 'Past', joined: '', ends: at(10) }, { id: '5', name: 'No goods', joined: '', ends: at(30) }] },
] }

test('activities split into open to join, joined and ended', async () => {
  const { splitActivities } = await load()
  const s = splitActivities(SECTION, NOW)
  assert.deepEqual(s.open.map((a) => a.id), ['3', '5'])
  assert.deepEqual(s.joined.map((a) => a.id), ['1'])
  assert.deepEqual(s.ended.map((a) => a.id).sort(), ['2', '4'])
  assert.equal(s.open[0].canEnrol, true)
  assert.equal(s.open[1].canEnrol, false)
})

test('when an activity ends', async () => {
  const { endsText } = await load()
  assert.equal(endsText({ ends: at(28) }, NOW), 'ends in 3 days')
  assert.equal(endsText({ ends: new Date(2026, 10, 25, 20, 0).toISOString() }, NOW), 'ends today')
  assert.equal(endsText({ ends: at(20) }, NOW), 'ended')
  assert.equal(endsText({}, NOW), '')
})

test('unchecked activities, no end date, Temu ended status, joined only in available', async () => {
  const { splitActivities } = await load()
  const s = splitActivities({ tables: [
    { id: 'joined', rows: [] },
    { id: 'available', rows: [
      { id: 'a', joined: 'Yes', ends: at(28) },
      { id: 'b', joined: '', checked: true, actions: [] },
      { id: 'c', joined: '' },
      { id: 'd', joined: '', status: 'Ended' },
    ] },
  ] }, NOW)
  assert.deepEqual(s.joined.map((x) => x.id), ['a'])
  assert.deepEqual(s.open.map((x) => [x.id, x.checked]), [['b', true], ['c', false]])
  assert.deepEqual(s.ended.map((x) => x.id), ['d'])
})

test('a table Temu failed to load gives no count', async () => {
  const { splitActivities } = await load()
  const s = splitActivities({ tables: [{ id: 'joined', rows: [{ id: '1', joined: 'Yes' }] }, { id: 'available', rows: [], error: 'denied' }] }, NOW)
  assert.equal(s.failed.available, true)
  assert.equal(s.failed.joined, false)
})
