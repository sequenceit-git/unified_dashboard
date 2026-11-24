const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

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
function load({ get = {}, send = {}, calls = [], listings = [], products = [], files = {} } = {}) {
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
    '../client': {
      ebaySend: async (token, method, url, body) => answer(send, method, url, body),
      ebayFetchBuffer: async (token, url) => answer(files, 'FILE', url),
    },
    '/models/Listing': modelStub(() => listings),
    '/models/Product': modelStub(() => products),
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
    assert.deepEqual(ids('3'), ['ads'])
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

const LISTINGS = [{ externalListingId: '111', productId: 'p1' }, { externalListingId: 'item-222', productId: 'p2' }, { externalListingId: '333', productId: 'p3' }]
const PRODUCTS = [{ _id: 'p1', title: 'Red mug' }, { _id: 'p2', title: 'Blue mug' }, { _id: 'p3', title: 'Green mug' }]
const recs = (url, body) => ({ listingRecommendations: body.listingIds.map((listingId) => ({ listingId, marketing: { ad: { bidPercentages: listingId === '333' ? [] : [{ basis: 'TRENDING', value: '3.0' }, { basis: 'ITEM', value: '6.5' }] } } })) })

test("a campaign's ads are listed across pages with titles", async () => {
  const ads = [{ adId: 'a1', listingId: '111', bidPercentage: '5.0', adStatus: 'ACTIVE' }, { adId: 'a2', listingId: '999', bidPercentage: '7.0', adStatus: 'PAUSED' }]
  const { advertising, restore, calls } = load({
    listings: LISTINGS, products: PRODUCTS,
    get: { '/sell/marketing/v1/ad_campaign/1/ad?': (url) => (url.includes('offset=0') ? { ads: [ads[0]], total: 2 } : { ads: [ads[1]], total: 2 }) },
  })
  try {
    const detail = await advertising.details.ads('tok', { _id: 's1' }, '1')
    assert.equal(calls.length, 2)
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.listingId, r.title, r.rate, r.status]), [['111', 'Red mug', 5, 'Active'], ['999', '—', 7, 'Paused']])
  } finally { restore() }
})

test("eBay's suggested rate comes from the Recommendation API", async () => {
  const { advertising, restore, calls } = load({ send: { '/sell/recommendation/v1/find': recs } })
  try {
    const ids = Array.from({ length: 600 }, (_, i) => String(1000 + i)).concat('333')
    const rates = await advertising.suggestedRates('tok', ids)
    const finds = calls.filter(([, u]) => u.includes('/find'))
    assert.equal(finds.length, 2)
    assert.equal(finds[0][1], '/sell/recommendation/v1/find?filter=recommendationTypes:%7BAD%7D')
    assert.equal(finds[0][2].listingIds.length, 500)
    assert.equal(rates.get('1000'), 6.5)
    assert.equal(rates.has('333'), false)
  } finally { restore() }
})

test("the Add listings input offers the shop's listings not in the campaign, marking eBay's suggestions", async () => {
  const { advertising, restore } = load({
    listings: LISTINGS, products: PRODUCTS,
    get: {
      '/sell/marketing/v1/ad_campaign?': { campaigns: [campaign('1', 'RUNNING'), campaign('4', 'RUNNING', 'COST_PER_CLICK'), campaign('3', 'ENDED')] },
      '/sell/marketing/v1/ad_campaign/1/ad?': { ads: [{ listingId: '111', bidPercentage: '5.0', adStatus: 'ACTIVE' }], total: 1 },
      '/sell/marketing/v1/ad_campaign/1/suggest_items': { suggestedItems: [{ listingId: '333' }] },
    },
  })
  try {
    const rows = (await advertising('tok', { _id: 's1' }, { now: NOW })).tables[0].rows
    const add = rows.find((r) => r.id === '1').actions.find((a) => a.id === 'add-listings')
    const listingsField = add.input.fields.find((f) => f.name === 'listings')
    assert.equal(listingsField.multiple, true)
    assert.deepEqual(listingsField.options, [{ value: '333', label: 'Green mug (333) (suggested by eBay)' }, { value: '222', label: 'Blue mug (222)' }])
    assert.equal(add.input.fields.find((f) => f.name === 'rate').optional, true)
    const remove = rows.find((r) => r.id === '1').actions.find((a) => a.id === 'remove-listings')
    assert.deepEqual(remove.input.fields[0].options.map((o) => o.value), ['111'])
    assert.ok(rows.find((r) => r.id === '1').actions.some((a) => a.id === 'ads' && a.detail))
    assert.deepEqual(rows.find((r) => r.id === '4').actions.filter((a) => ['add-listings', 'remove-listings', 'set-rate'].includes(a.id)), [])
    assert.ok(rows.find((r) => r.id === '4').actions.some((a) => a.id === 'ads'))
    assert.deepEqual(rows.find((r) => r.id === '3').actions.map((a) => a.id), ['ads'])
  } finally { restore() }
})

test('adding 1,200 listings goes in three batches and reports refusals', async () => {
  const ids = Array.from({ length: 1200 }, (_, i) => String(5000 + i))
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_campaign/1': campaign('1', 'RUNNING') },
    send: {
      '/sell/recommendation/v1/find': recs,
      bulk_create_ads_by_listing_id: (url, body) => ({ responses: body.requests.map((r) => (r.listingId === '5001' ? { listingId: r.listingId, statusCode: 409, errors: [{ message: 'The listing is already in another campaign.' }] } : { listingId: r.listingId, statusCode: 201, adId: 'x' })) }),
    },
  })
  try {
    const res = await advertising.actions['add-listings']('tok', { _id: 's1' }, '1', { listings: ids, rate: '' })
    const creates = calls.filter(([, u]) => u.includes('bulk_create_ads_by_listing_id'))
    assert.deepEqual(creates.map(([, , b]) => b.requests.length), [500, 500, 200])
    assert.equal(creates[0][1], '/sell/marketing/v1/ad_campaign/1/bulk_create_ads_by_listing_id')
    assert.deepEqual(creates[0][2].requests[0], { listingId: '5000', bidPercentage: '6.5' })
    assert.deepEqual(res.refused, [{ listingId: '5001', reason: 'The listing is already in another campaign.' }])
    assert.equal(res.message, 'Added 1199 listings. Not added: 5001 (The listing is already in another campaign.).')
    const fixed = await advertising.actions['add-listings']('tok', { _id: 's1' }, '1', { listings: ['7'], rate: '8' })
    assert.ok(fixed.message.startsWith('Added 1 listing.'))
    assert.deepEqual(calls.filter(([, u]) => u.includes('bulk_create')).at(-1)[2].requests, [{ listingId: '7', bidPercentage: '8.0' }])
  } finally { restore() }
})

test('remove and set rate act on the chosen listings', async () => {
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_campaign/1': campaign('1', 'RUNNING') },
    send: {
      bulk_delete_ads_by_listing_id: (url, body) => ({ responses: body.requests.map((r) => ({ listingId: r.listingId, statusCode: 200 })) }),
      bulk_update_ads_bid_by_listing_id: (url, body) => ({ responses: body.requests.map((r) => ({ listingId: r.listingId, statusCode: 200 })) }),
    },
  })
  try {
    await advertising.actions['remove-listings']('tok', {}, '1', { listings: ['111', '222'] })
    await advertising.actions['set-rate']('tok', {}, '1', { listings: ['111'], rate: '9.25' })
    assert.deepEqual(calls.filter(([m]) => m === 'POST').map(([, u, b]) => [u, b]), [
      ['/sell/marketing/v1/ad_campaign/1/bulk_delete_ads_by_listing_id', { requests: [{ listingId: '111' }, { listingId: '222' }] }],
      ['/sell/marketing/v1/ad_campaign/1/bulk_update_ads_bid_by_listing_id', { requests: [{ listingId: '111', bidPercentage: '9.3' }] }],
    ])
    const before = calls.length
    for (const rate of ['1.5', '101', 'abc']) await assert.rejects(advertising.actions['set-rate']('tok', {}, '1', { listings: ['111'], rate }), (e) => e.status === 400, rate)
    await assert.rejects(advertising.actions['add-listings']('tok', {}, '1', { listings: ['1'], rate: '120' }), (e) => e.status === 400)
    assert.equal(calls.length, before)
  } finally { restore() }
})

test('creating a campaign sends a cost-per-sale campaign and adds the chosen listings', async () => {
  let created = false
  const { advertising, restore, calls } = load({
    get: {
      'get_campaign_by_name': () => { if (!created) throw Object.assign(new Error('not found'), { status: 404 }); return campaign('77', 'SCHEDULED') },
      '/sell/marketing/v1/ad_campaign/77': campaign('77', 'SCHEDULED'),
    },
    send: {
      '/sell/marketing/v1/ad_campaign': (url) => { if (url === '/sell/marketing/v1/ad_campaign') created = true; return {} },
      bulk_create_ads_by_listing_id: (url, body) => ({ responses: body.requests.map((r) => ({ listingId: r.listingId, statusCode: 201 })) }),
    },
  })
  advertising.now = () => NOW
  try {
    const res = await advertising.actions.create('tok', { _id: 's1' }, 'campaigns', { name: ' Winter ', rate: '7', start: '2026-12-01', end: '2027-01-31', listings: ['111', '222'] })
    const post = calls.find(([m, u]) => m === 'POST' && u === '/sell/marketing/v1/ad_campaign')
    assert.deepEqual(post[2], { campaignName: 'Winter', marketplaceId: 'EBAY_US', startDate: '2026-12-01T00:00:00.000Z', endDate: '2027-01-31T23:59:59.000Z', fundingStrategy: { fundingModel: 'COST_PER_SALE', bidPercentage: '7.0' } })
    assert.ok(calls.some(([m, u]) => m === 'GET' && u === '/sell/marketing/v1/ad_campaign/get_campaign_by_name?campaign_name=Winter'))
    assert.deepEqual(calls.find(([, u]) => u.includes('/77/bulk_create_ads_by_listing_id'))[2].requests, [{ listingId: '111', bidPercentage: '7.0' }, { listingId: '222', bidPercentage: '7.0' }])
    assert.equal(res.message, 'Campaign "Winter" created. Added 2 listings.')
  } finally { restore() }
})

test('a name already used is refused before eBay is asked to create', async () => {
  const { advertising, restore, calls } = load({ get: { get_campaign_by_name: campaign('9', 'RUNNING') } })
  advertising.now = () => NOW
  try {
    await assert.rejects(advertising.actions.create('tok', {}, 'campaigns', { name: 'Camp 9' }), (e) => e.status === 400 && /A campaign named "Camp 9" already exists\./.test(e.body.error))
    assert.equal(calls.filter(([m]) => m === 'POST').length, 0)
  } finally { restore() }
})

test('start defaults to now; a past start or an end before the start is refused', async () => {
  const { advertising, restore, calls } = load({
    get: { get_campaign_by_name: () => { if (calls.some(([m]) => m === 'POST')) return campaign('5', 'RUNNING'); throw Object.assign(new Error('nf'), { status: 404 }) } },
    send: { '/sell/marketing/v1/ad_campaign': {} },
  })
  advertising.now = () => NOW
  try {
    await assert.rejects(advertising.actions.create('tok', {}, 'campaigns', { name: 'A', start: '2026-11-01' }), (e) => e.status === 400)
    await assert.rejects(advertising.actions.create('tok', {}, 'campaigns', { name: 'A', start: '2026-12-10', end: '2026-12-01' }), (e) => e.status === 400)
    assert.equal(calls.filter(([m]) => m === 'POST').length, 0)
    await advertising.actions.create('tok', {}, 'campaigns', { name: 'A' })
    const post = calls.find(([m]) => m === 'POST')[2]
    assert.equal(post.startDate, NOW.toISOString())
    assert.equal(post.endDate, undefined)
    assert.deepEqual(post.fundingStrategy, { fundingModel: 'COST_PER_SALE' })
  } finally { restore() }
})

test('copy makes a new campaign from an ended rules-based one', async () => {
  const source = campaign('3', 'ENDED', 'COST_PER_SALE', { campaignCriterion: { autoSelectFutureInventory: true } })
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_campaign?': { campaigns: [source, campaign('6', 'ENDED')] }, '/sell/marketing/v1/ad_campaign/3': source },
    send: { '/clone': {} },
  })
  advertising.now = () => NOW
  try {
    const rows = (await advertising('tok', {}, { now: NOW })).tables[0].rows
    assert.ok(rows.find((r) => r.id === '3').actions.some((a) => a.id === 'clone'))
    assert.ok(!rows.find((r) => r.id === '6').actions.some((a) => a.id === 'clone'))
    assert.ok((await advertising('tok', {}, { now: NOW })).tables[0].actions.some((a) => a.id === 'create'))
    await advertising.actions.clone('tok', {}, '3', { name: 'Again' })
    assert.deepEqual(calls.find(([m]) => m === 'POST'), ['POST', '/sell/marketing/v1/ad_campaign/3/clone', { campaignName: 'Again', startDate: NOW.toISOString(), fundingStrategy: source.fundingStrategy }])
  } finally { restore() }
})

const zlib = require('node:zlib')
const tsv = (lines) => zlib.gzipSync(Buffer.from(lines.join('\n')))

test('report tasks are listed with status', async () => {
  const { advertising, restore } = load({
    get: {
      '/sell/marketing/v1/ad_campaign?': { campaigns: [] },
      '/sell/marketing/v1/ad_report_task?': { reportTasks: [
        { reportTaskId: 'T1', reportType: 'CAMPAIGN_PERFORMANCE_REPORT', reportTaskStatus: 'SUCCESS', reportId: 'R1', dateFrom: '2026-10-25T00:00:00.000Z', dateTo: '2026-11-24T00:00:00.000Z', reportTaskCreationDate: '2026-11-24T09:00:00.000Z' },
        { reportTaskId: 'T2', reportType: 'LISTING_PERFORMANCE_REPORT', reportTaskStatus: 'PENDING', dateFrom: '2026-11-17T00:00:00.000Z', dateTo: '2026-11-24T00:00:00.000Z' },
        { reportTaskId: 'T3', reportType: 'ACCOUNT_PERFORMANCE_REPORT', reportTaskStatus: 'FAILED', reportTaskStatusMessage: 'No data for the period' },
      ] },
    },
  })
  try {
    const { tables } = await advertising('tok', {}, { now: NOW })
    const t = tables.find((x) => x.id === 'reports')
    assert.equal(t.tab, 'Reports')
    const row = (id) => t.rows.find((r) => r.id === id)
    assert.deepEqual([row('T1').type, row('T1').status, row('T1').period], ['Campaign performance', 'Success', '2026-10-25 – 2026-11-24'])
    assert.ok(row('T1').actions.some((a) => a.id === 'report' && a.detail))
    assert.ok(!row('T2').actions.some((a) => a.id === 'report'))
    assert.equal(row('T3').message, 'No data for the period')
    assert.ok(t.rows.every((r) => r.actions.some((a) => a.id === 'delete-report')))
    assert.deepEqual(t.actions[0].input.fields.map((f) => [f.name, f.options.map((o) => o.value)]), [
      ['type', ['CAMPAIGN_PERFORMANCE_REPORT', 'LISTING_PERFORMANCE_REPORT', 'ACCOUNT_PERFORMANCE_REPORT']], ['days', ['7', '30', '90']],
    ])
  } finally { restore() }
})

test("requesting a report uses eBay's metrics for that report type", async () => {
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_campaign?': { campaigns: [campaign('1', 'RUNNING')] }, '/sell/marketing/v1/ad_report_metadata/CAMPAIGN_PERFORMANCE_REPORT': { maxNumberOfMetricsToRequest: 2, dimensionMetadata: [{ dimensionKey: 'campaign_id' }, { dimensionKey: 'day' }], metricMetadata: [{ metricKey: 'impressions' }, { metricKey: 'clicks' }, { metricKey: 'sales' }] } },
    send: { '/sell/marketing/v1/ad_report_task': {} },
  })
  advertising.now = () => NOW
  try {
    const res = await advertising.actions['request-report']('tok', {}, 'reports', { type: 'CAMPAIGN_PERFORMANCE_REPORT', days: '30' })
    assert.deepEqual(calls.find(([m]) => m === 'POST'), ['POST', '/sell/marketing/v1/ad_report_task', {
      reportType: 'CAMPAIGN_PERFORMANCE_REPORT', dateFrom: '2026-10-25T10:00:00.000Z', dateTo: '2026-11-24T10:00:00.000Z', marketplaceId: 'EBAY_US',
      fundingModels: ['COST_PER_SALE'], dimensions: [{ dimensionKey: 'campaign_id' }], metricKeys: ['impressions', 'clicks'], reportFormat: 'TSV_GZIP', campaignIds: ['1'],
    }])
    assert.match(res.message, /eBay is building the report/)
    await assert.rejects(advertising.actions['request-report']('tok', {}, 'reports', { type: 'NOPE', days: '30' }), (e) => e.status === 400)
    await assert.rejects(advertising.actions['request-report']('tok', {}, 'reports', { type: 'CAMPAIGN_PERFORMANCE_REPORT', days: '12' }), (e) => e.status === 400)
  } finally { restore() }
})

test('a finished report opens as a table', async () => {
  const { advertising, restore, calls } = load({
    get: { '/sell/marketing/v1/ad_report_task/T1': { reportTaskId: 'T1', reportId: 'R1', reportType: 'CAMPAIGN_PERFORMANCE_REPORT', reportTaskStatus: 'SUCCESS' } },
    files: { '/sell/marketing/v1/ad_report/R1': tsv(['campaign_id\timpressions\tsales', '1\t1200\t45.5', '4\t30\t0']) },
  })
  try {
    const detail = await advertising.details.report('tok', {}, 'T1')
    assert.ok(calls.some(([m, u]) => m === 'FILE' && u === '/sell/marketing/v1/ad_report/R1'))
    const t = detail.tables[0]
    assert.deepEqual(t.columns.map((c) => [c.key, c.label, c.type]), [['c0', 'Campaign id', 'text'], ['c1', 'Impressions', 'number'], ['c2', 'Sales', 'number']])
    assert.deepEqual(t.rows[0], { c0: '1', c1: 1200, c2: 45.5 })
    assert.equal(advertising.readReport(Buffer.from('a\tb\nx\t2')).rows[0].c1, 2)
  } finally { restore() }
})

test('a report over 500 rows shows the first 500 and says so', async () => {
  const lines = ['listing_id\tclicks', ...Array.from({ length: 620 }, (_, i) => `${i}\t${i}`)]
  const { advertising, restore } = load({
    get: { '/sell/marketing/v1/ad_report_task/T1': { reportTaskId: 'T1', reportId: 'R1', reportTaskStatus: 'SUCCESS' } },
    files: { '/sell/marketing/v1/ad_report/R1': tsv(lines) },
  })
  try {
    const t = (await advertising.details.report('tok', {}, 'T1')).tables[0]
    assert.equal(t.rows.length, 500)
    assert.match(t.note, /first 500 of 620 rows/)
    await assert.rejects(load({ get: { '/sell/marketing/v1/ad_report_task/T2': { reportTaskStatus: 'PENDING' } } }).advertising.details.report('tok', {}, 'T2'), (e) => e.status === 400)
  } finally { restore() }
})

test('deleting a report task calls eBay', async () => {
  const { advertising, restore, calls } = load({ send: { '/sell/marketing/v1/ad_report_task/': {} } })
  try {
    await advertising.actions['delete-report']('tok', {}, 'T2')
    assert.deepEqual(calls[0], ['DELETE', '/sell/marketing/v1/ad_report_task/T2', undefined])
  } finally { restore() }
})

test('campaign and listing reports name the campaigns or listings eBay asks for', async () => {
  const meta = { dimensionMetadata: [{ dimensionKey: 'campaign_id' }], metricMetadata: [{ metricKey: 'clicks' }] }
  const { advertising, restore, calls } = load({
    listings: LISTINGS,
    get: { ad_report_metadata: meta, '/sell/marketing/v1/ad_campaign?': { campaigns: [campaign('1', 'RUNNING'), campaign('4', 'RUNNING', 'COST_PER_CLICK'), campaign('3', 'ENDED')] } },
    send: { '/sell/marketing/v1/ad_report_task': {} },
  })
  advertising.now = () => NOW
  try {
    await advertising.actions['request-report']('tok', { _id: 's1' }, 'reports', { type: 'CAMPAIGN_PERFORMANCE_REPORT', days: '7' })
    await advertising.actions['request-report']('tok', { _id: 's1' }, 'reports', { type: 'LISTING_PERFORMANCE_REPORT', days: '7' })
    await advertising.actions['request-report']('tok', { _id: 's1' }, 'reports', { type: 'ACCOUNT_PERFORMANCE_REPORT', days: '7' })
    const posts = calls.filter(([m]) => m === 'POST').map(([, , b]) => b)
    assert.deepEqual(posts[0].campaignIds, ['1', '3'])
    assert.deepEqual(posts[1].listingIds, ['111', '222', '333'])
    assert.equal(posts[2].campaignIds, undefined)
    assert.equal(posts[2].listingIds, undefined)
  } finally { restore() }
})

test('a batch eBay refuses as a whole is reported and the other batches still count', async () => {
  const ids = Array.from({ length: 700 }, (_, i) => String(9000 + i))
  let n = 0
  const { advertising, restore } = load({
    send: { bulk_create_ads_by_listing_id: (url, body) => { n += 1; if (n === 2) throw new Error('eBay is busy'); return { responses: body.requests.map((r) => ({ listingId: r.listingId, statusCode: 201 })) } } },
  })
  try {
    const res = await advertising.actions['add-listings']('tok', {}, '1', { listings: ids, rate: '5' })
    assert.equal(res.refused.length, 200)
    assert.equal(res.refused[0].reason, 'eBay is busy')
    assert.ok(res.message.startsWith('Added 500 listings.'))
  } finally { restore() }
})
