const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const NOW = new Date('2026-11-24T10:00:00.000Z')
const USD = (value) => ({ value: String(value), currency: 'USD' })
const campaign = (id, status, model = 'COST_PER_SALE', extra = {}) => ({
  campaignId: id, campaignName: `Camp ${id}`, campaignStatus: status, startDate: '2026-10-01T00:00:00.000Z',
  fundingStrategy: { fundingModel: model, ...(model === 'COST_PER_SALE' ? { bidPercentage: '5.0' } : {}) },
  ...(model === 'COST_PER_CLICK' ? { budget: { daily: { amount: USD(20) } } } : {}),
  ...extra,
})
const CAMPAIGNS = [
  campaign('1', 'RUNNING'), campaign('2', 'PAUSED'), campaign('3', 'ENDED', 'COST_PER_SALE', { endDate: '2026-11-01T00:00:00.000Z' }),
  campaign('4', 'RUNNING', 'COST_PER_CLICK'), campaign('5', 'ENDED', 'COST_PER_SALE', { endDate: '2025-01-01T00:00:00.000Z' }),
]

/** eBay stub: `get` and `send` answer by path; every call is recorded. */
function load({ get = {}, send = {}, calls = [] } = {}) {
  const answer = (table, method, url, body) => {
    calls.push([method, url, body])
    const key = Object.keys(table).find((k) => url.includes(k))
    if (key === undefined) throw new Error(`unexpected ${method} ${url}`)
    return typeof table[key] === 'function' ? table[key](url, body) : table[key]
  }
  const restore = stubModules({
    './helpers': {
      ebayGet: async (token, url) => answer(get, 'GET', url),
      ebayApiz: () => 'https://apiz.ebay.com',
      scopeAware: (fn) => fn,
    },
    '../client': { ebaySend: async (token, method, url, body) => answer(send, method, url, body) },
  })
  return { advertising: freshRequire('marketplaces/ebay/sections/advertising.js'), restore, calls }
}
const pages = (all, size) => (url) => {
  const offset = Number(new URL(url, 'https://x').searchParams.get('offset') || 0)
  return { campaigns: all.slice(offset, offset + size), total: all.length }
}

test('campaigns list every page with type, status, rate and budget', async () => {
  const { advertising, restore, calls } = load({ get: { '/sell/marketing/v1/ad_campaign?': pages(CAMPAIGNS, 3) } })
  try {
    const { tables, summary } = await advertising('tok', {}, { now: NOW })
    const t = tables.find((x) => x.id === 'campaigns')
    assert.equal(t.tab, 'Campaigns')
    assert.equal(calls.filter(([m, u]) => m === 'GET' && u.includes('ad_campaign?')).length, 2)
    const one = t.rows.find((r) => r.id === '1')
    assert.deepEqual([one.name, one.type, one.status, one.rate], ['Camp 1', 'General (cost per sale)', 'Running', 5])
    const cpc = t.rows.find((r) => r.id === '4')
    assert.deepEqual([cpc.type, cpc.rate, cpc.budget.value], ['Priority (cost per click)', null, 20])
    assert.deepEqual(summary.map((s) => [s.label, s.value]), [['Running', 2], ['Paused', 1], ['Ended (last 90 days)', 1]])
  } finally { restore() }
})

test('running campaigns offer Pause and End, paused offer Resume and End, ended offer none', async () => {
  const { advertising, restore } = load({ get: { '/sell/marketing/v1/ad_campaign?': { campaigns: CAMPAIGNS } } })
  try {
    const rows = (await advertising('tok', {}, { now: NOW })).tables[0].rows
    const ids = (id) => rows.find((r) => r.id === id).actions.map((a) => a.id)
    assert.ok(['pause', 'end'].every((a) => ids('1').includes(a)) && !ids('1').includes('resume'))
    assert.ok(['resume', 'end'].every((a) => ids('2').includes(a)) && !ids('2').includes('pause'))
    assert.deepEqual(ids('3'), [])
    assert.ok(ids('4').includes('budget') && !ids('1').includes('budget'))
    assert.match(rows.find((r) => r.id === '1').actions.find((a) => a.id === 'end').confirm, /End campaign "Camp 1"\? Its ads stop and it can't be restarted\./)
  } finally { restore() }
})

test('pause, resume and end call eBay for that campaign', async () => {
  const { advertising, restore, calls } = load({ send: { '/pause': {}, '/resume': {}, '/end': {} } })
  try {
    for (const verb of ['pause', 'resume', 'end']) {
      const res = await advertising.actions[verb]('tok', {}, '1')
      assert.ok(res.message)
    }
    assert.deepEqual(calls.map(([m, u]) => `${m} ${u}`), [
      'POST /sell/marketing/v1/ad_campaign/1/pause', 'POST /sell/marketing/v1/ad_campaign/1/resume', 'POST /sell/marketing/v1/ad_campaign/1/end',
    ])
  } finally { restore() }
})

test('rename and budget call eBay', async () => {
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_campaign/4': campaign('4', 'RUNNING', 'COST_PER_CLICK'), '/sell/marketing/v1/ad_campaign/1': campaign('1', 'RUNNING') },
    send: { update_campaign_identification: {}, update_campaign_budget: {} },
  })
  try {
    await advertising.actions.rename('tok', {}, '1', ' Spring sale ')
    await advertising.actions.budget('tok', {}, '4', '35')
    const sent = calls.filter(([m]) => m === 'POST')
    assert.deepEqual(sent[0], ['POST', '/sell/marketing/v1/ad_campaign/1/update_campaign_identification', { campaignName: 'Spring sale' }])
    assert.deepEqual(sent[1], ['POST', '/sell/marketing/v1/ad_campaign/4/update_campaign_budget', { daily: { amount: { value: '35.00', currency: 'USD' } } }])
    await assert.rejects(advertising.actions.budget('tok', {}, '1', '35'), (e) => e.status === 400)
    await assert.rejects(advertising.actions.rename('tok', {}, '1', '  '), (e) => e.status === 400)
  } finally { restore() }
})
