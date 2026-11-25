import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/ebay/sections/advertising/advertisingView.js')
test.after(() => server.close())

const SECTION = { tables: [
  {
    id: 'campaigns',
    actions: [{ id: 'create', input: { fields: [{ name: 'name' }, { name: 'listings', options: [{ value: '111', label: 'Phone case (111)' }] }] } }],
    rows: [
      { id: 'c1', rawStatus: 'RUNNING', actions: [{ id: 'ads', detail: true }, { id: 'add-listings' }, { id: 'set-rate' }, { id: 'pause' }, { id: 'rename' }, { id: 'end' }] },
      { id: 'c2', rawStatus: 'PAUSED', actions: [{ id: 'ads', detail: true }, { id: 'resume' }] },
      { id: 'c3', rawStatus: 'ENDED', actions: [{ id: 'ads', detail: true }, { id: 'clone' }] },
    ],
  },
  { id: 'reports', rows: [{ id: 'r1' }] },
] }

test('campaigns by state; pills with counts (Scheduled and Paused only when there are some)', async () => {
  const { campaignRows, campaignPills } = await load()
  const rows = campaignRows(SECTION)
  assert.deepEqual(rows.map((r) => r.state), ['running', 'paused', 'ended'])
  assert.deepEqual(campaignPills(rows, [{}]).map((p) => [p.key, p.count]), [['running', 1], ['paused', 1], ['ended', 1], ['all', 3], ['reports', 1]])
  assert.equal(campaignRows({ tables: [{ id: 'campaigns', rows: [], error: 'x' }] }), null)
})

test("a campaign's actions: its ads vs the campaign; Pause / Resume as the quick one", async () => {
  const { campaignRows, splitActions } = await load()
  const [c1, c2, c3] = campaignRows(SECTION).map(splitActions)
  assert.deepEqual(c1.ads.map((a) => a.id), ['add-listings', 'set-rate'])
  assert.deepEqual(c1.campaign.map((a) => a.id), ['pause', 'rename', 'end'])
  assert.equal(c1.quick.id, 'pause')
  assert.equal(c2.quick.id, 'resume')
  assert.equal(c3.quick, null)
})

test('new campaign: listings from the loader, checks per step', async () => {
  const { campaignListings, newCampaignProblems } = await load()
  assert.deepEqual(campaignListings(SECTION).map((o) => o.value), ['111'])
  assert.deepEqual(newCampaignProblems({ name: 'Spring', rate: '', start: '', end: '' }), [])
  assert.deepEqual(newCampaignProblems({ name: ' ', rate: '1', start: '2026-12-10', end: '2026-12-01' }).map((p) => p.step), ['rate', 'details', 'details'])
})

test('ENDING counts as ended; a one-day campaign is allowed', async () => {
  const { campaignRows, newCampaignProblems } = await load()
  assert.equal(campaignRows({ tables: [{ id: 'campaigns', rows: [{ id: 'x', rawStatus: 'ENDING' }] }] })[0].state, 'ended')
  assert.deepEqual(newCampaignProblems({ name: 'One day', rate: '', start: '2026-12-01', end: '2026-12-01' }), [])
})
