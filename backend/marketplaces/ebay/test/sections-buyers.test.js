const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const ENTRIES = { feedbackEntries: [
  { feedbackId: 'F1', feedbackEnteredDate: '2026-11-01T00:00:00Z', commentType: 'POSITIVE', feedbackComment: { commentText: 'Great' }, providerUserDetail: { userId: 'amy' }, orderLineItemSummary: { listingTitle: 'Jeans', listingId: '111' }, replyComment: { commentText: 'Thanks!' } },
  { feedbackId: 'F2', feedbackEnteredDate: '2026-11-20T00:00:00Z', commentType: 'NEGATIVE', feedbackComment: { commentText: 'Late' }, providerUserDetail: { userId: 'bob' }, orderLineItemSummary: { listingTitle: 'Shirt', listingId: '222' } },
] }
const SUMMARY = { feedbackRatingSummary: [{ ratingType: 'OVERALL_EXPERIENCE', ratingSummaryByRatingType: [{ userRoleType: 'SELLER', feedbackRatingValueDistribution: [{ value: 'POSITIVE', count: 98 }, { value: 'NEUTRAL', count: 3 }, { value: 'NEGATIVE', count: 2 }], feedbackMetrics: [] }] }] }

function loadSection() {
  const urls = []
  const restore = stubModules({
    './helpers': {
      scopeAware: require('../sections/helpers').scopeAware,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url) => { urls.push(url); return url.includes('feedback_rating_summary') ? SUMMARY : ENTRIES },
    },
  })
  return { buyers: freshRequire('marketplaces/ebay/sections/buyers.js'), urls, restore }
}

test('received feedback is listed newest first', async () => {
  const { buyers, urls, restore } = loadSection()
  try {
    const data = await buyers('tok', { accountUsername: 'my-store' })
    const t = data.tables.find((x) => x.id === 'received')
    assert.equal(t.tab, 'Feedback')
    assert.deepEqual(t.rows.map((r) => r.id), ['F2', 'F1'])
    assert.ok(urls.some((u) => u.startsWith('/commerce/feedback/v1/feedback?user_id=my-store&feedback_type=FEEDBACK_RECEIVED')))
    assert.ok(urls.some((u) => u.startsWith('/commerce/feedback/v1/feedback_rating_summary?user_id=my-store&filter=')))
    const tiles = Object.fromEntries(data.summary.map((s) => [s.label, s.value]))
    assert.equal(tiles['Positive feedback'], 98)
    assert.equal(tiles.Negative, 2)
  } finally { restore() }
})

test('reply is offered only where none exists', async () => {
  const { buyers, restore } = loadSection()
  try {
    const rows = (await buyers('tok', { accountUsername: 'my-store' })).tables[0].rows
    assert.deepEqual(rows.map((r) => r.actions.map((a) => a.id)), [['reply'], []])
    assert.equal(rows[0].actions[0].input.maxLength, 500)
  } finally { restore() }
})

test('a shop without its eBay user name asks for a reconnect', async () => {
  const { buyers, restore } = loadSection()
  try {
    assert.match((await buyers('tok', {})).tables[0].error, /Reconnect eBay/)
  } finally { restore() }
})

function loadService(sent) {
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'ebay', status: 'connected', accountUsername: 'my-store' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    'sections/helpers': { ...require('../sections/helpers'), ebayGet: async () => ({ feedbackEntries: [{ feedbackId: 'F2', providerUserDetail: { userId: 'bob' } }] }) },
    '../../client': { ...require('../client'), ebaySend: async (token, method, url, body) => { sent.push([method, url, body]); return {} } },
  })
}

test('a reply goes to the buyer who left the feedback', async () => {
  const sent = []
  const restore = loadService(sent)
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    const res = await service.replyToFeedback({ user: { role: 'super_admin' }, body: { id: 'F2', value: 'Sorry, we refunded you.' }, params: {}, query: {} })
    assert.ok(res.message)
    assert.deepEqual(sent, [['POST', '/commerce/feedback/v1/respond_to_feedback', { feedbackId: 'F2', recipientUserId: 'bob', responseText: 'Sorry, we refunded you.', responseType: 'REPLY' }]])
  } finally { restore() }
})

test('a reply over 500 characters is refused before calling eBay', async () => {
  const sent = []
  const restore = loadService(sent)
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    await assert.rejects(service.replyToFeedback({ user: { role: 'super_admin' }, body: { id: 'F2', value: 'x'.repeat(501) }, params: {}, query: {} }), (e) => e.status === 400)
    await assert.rejects(service.replyToFeedback({ user: { role: 'super_admin' }, body: { id: 'F2', value: '   ' }, params: {}, query: {} }), (e) => e.status === 400)
    assert.equal(sent.length, 0)
  } finally { restore() }
})
