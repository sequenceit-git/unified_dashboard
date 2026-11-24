const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const APIZ = 'https://apiz.ebay.com'
const USD = (v) => ({ value: String(v), currency: 'USD' })
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const dataUrl = (type, buf) => `data:${type};base64,${buf.toString('base64')}`
const DISPUTE = {
  paymentDisputeId: 'D1', paymentDisputeStatus: 'ACTION_NEEDED', reason: 'ITEM_NOT_RECEIVED', amount: USD(40), revision: 3,
  respondByDate: '2026-11-30T00:00:00.000Z', availableChoices: ['CONTEST', 'ACCEPT'],
  lineItems: [{ itemId: '111', lineItemId: 'L1' }],
  evidenceRequests: [{ evidenceId: 'E9', evidenceType: 'PROOF_OF_DELIVERY', requestDate: '2026-11-20T00:00:00.000Z', respondByDate: '2026-11-30T00:00:00.000Z' }],
  evidence: [{ evidenceId: 'E1', evidenceType: 'PROOF_OF_PICKUP', providedDate: '2026-11-21T00:00:00.000Z', files: [{ fileId: 'F1', name: 'receipt.png' }] }],
}

/** The client `returnsActions` get: every call recorded; GETs answered from `gets`. */
function client(calls, { gets = {}, sends = {} } = {}) {
  const pick = (table, url) => table[Object.keys(table).find((k) => url.includes(k))]
  return {
    apiz: APIZ,
    ebaySend: async (token, method, url, body) => { calls.push([method, url, body]); return (method === 'GET' ? pick(gets, url) : pick(sends, url)) || {} },
    upload: async (token, url, file) => { calls.push(['UPLOAD', url, { name: file.name, type: file.type, bytes: file.buffer.length }]); return { fileId: 'NEWFILE' } },
    postOrder: async (token, path, opts) => { calls.push([opts.method, path, opts.body]); return pick(gets, path) || {} },
  }
}
const actions = () => freshRequire('marketplaces/ebay/sections/returnsActions.js').ACTIONS

test("a dispute's detail shows eBay's evidence requests, evidence on file and history", async () => {
  const urls = []
  const restore = stubModules({
    './helpers': {
      scopeAware: (fn) => fn,
      ebayApiz: () => APIZ,
      ebayGet: async (token, url) => {
        urls.push(url)
        if (url.endsWith('/activity')) return { activity: [{ activityDate: '2026-11-19T00:00:00.000Z', activityType: 'DISPUTE_OPENED', actor: 'BUYER' }] }
        return DISPUTE
      },
    },
  })
  try {
    const section = freshRequire('marketplaces/ebay/sections/returns-cases.js')
    const detail = await section.details.dispute('tok', {}, 'D1')
    assert.deepEqual(urls, [`${APIZ}/sell/fulfillment/v1/payment_dispute/D1`, `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/activity`])
    assert.deepEqual(detail.tables.map((t) => t.id), ['requests', 'evidence', 'activity'])
    assert.deepEqual(detail.tables[0].rows[0].type, 'Proof of delivery')
    assert.deepEqual(detail.tables[1].rows[0].files, 'receipt.png')
    assert.deepEqual([detail.tables[2].rows[0].what, detail.tables[2].rows[0].who], ['Dispute opened', 'Buyer'])
    assert.ok(detail.summary.some((s) => s.label === 'Respond by'))
  } finally { restore() }
})

test('adding evidence uploads the file then adds it to the dispute', async () => {
  const calls = []
  const c = client(calls, { gets: { '/payment_dispute/D1': DISPUTE }, sends: { add_evidence: { evidenceId: 'E2' } } })
  const res = await actions()['dispute-evidence'].run(c, 'tok', 'D1', { evidenceType: 'PROOF_OF_DELIVERY', file: { name: 'pod.png', type: 'image/png', size: PNG.length, dataUrl: dataUrl('image/png', PNG) } })
  assert.deepEqual(calls.filter(([m]) => m !== 'GET'), [
    ['UPLOAD', `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/upload_evidence_file`, { name: 'pod.png', type: 'image/png', bytes: PNG.length }],
    ['POST', `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/add_evidence`, { evidenceType: 'PROOF_OF_DELIVERY', files: [{ fileId: 'NEWFILE' }], lineItems: [{ itemId: '111', lineItemId: 'L1' }] }],
  ])
  assert.match(res.message, /pod\.png added/)
  calls.length = 0
  await actions()['dispute-evidence'].run(c, 'tok', 'D1', { evidenceType: 'PROOF_OF_PICKUP', file: { name: 'b.jpg', type: 'image/jpeg', size: JPG.length, dataUrl: dataUrl('image/jpeg', JPG) } })
  assert.deepEqual(calls.find(([m]) => m === 'POST'), ['POST', `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/update_evidence`, { evidenceId: 'E1', evidenceType: 'PROOF_OF_PICKUP', files: [{ fileId: 'NEWFILE' }], lineItems: [{ itemId: '111', lineItemId: 'L1' }] }])
})

test('a PDF or a 6 MB file is refused before eBay is called', async () => {
  const calls = []
  const c = client(calls, { gets: { '/payment_dispute/D1': DISPUTE } })
  const run = (file) => actions()['dispute-evidence'].run(c, 'tok', 'D1', { evidenceType: 'PROOF_OF_DELIVERY', file })
  await assert.rejects(run({ name: 'a.pdf', type: 'application/pdf', dataUrl: dataUrl('application/pdf', Buffer.from('%PDF-1.4')) }), (e) => e.status === 400 && /JPEG or PNG/.test(e.body.error))
  await assert.rejects(run({ name: 'fake.png', type: 'image/png', dataUrl: dataUrl('image/png', Buffer.from('not an image')) }), (e) => e.status === 400)
  const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)])
  await assert.rejects(run({ name: 'big.png', type: 'image/png', dataUrl: dataUrl('image/png', big) }), (e) => e.status === 400 && /5 MB/.test(e.body.error))
  await assert.rejects(run(undefined), (e) => e.status === 400)
  await assert.rejects(actions()['dispute-evidence'].run(c, 'tok', 'D1', { evidenceType: 'MADE_UP', file: { name: 'a.png', type: 'image/png', dataUrl: dataUrl('image/png', PNG) } }), (e) => e.status === 400)
  assert.equal(calls.length, 0)
})

test("contesting sends the dispute's revision and note", async () => {
  const calls = []
  const c = client(calls, { gets: { '/payment_dispute/D1': DISPUTE } })
  await actions()['dispute-contest'].run(c, 'tok', 'D1', { note: ' Delivered with signature ' })
  assert.deepEqual(calls.find(([m]) => m === 'POST'), ['POST', `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/contest`, { revision: 3, note: 'Delivered with signature' }])
  const snad = { ...DISPUTE, reason: 'SIGNIFICANTLY_NOT_AS_DESCRIBED' }
  const c2 = client(calls, { gets: { '/payment_dispute/D1': snad } })
  const address = { fullName: 'Ann Seller', addressLine1: '1 Main St', city: 'Austin', stateOrProvince: 'TX', postalCode: '78701', country: 'US', primaryPhone: '5125550100' }
  await assert.rejects(actions()['dispute-contest'].run(c2, 'tok', 'D1', {}), (e) => e.status === 400 && /return address/.test(e.body.error))
  calls.length = 0
  await actions()['dispute-contest'].run(c2, 'tok', 'D1', address)
  assert.deepEqual(calls.find(([m]) => m === 'POST')[2], { revision: 3, returnAddress: { ...address, primaryPhone: { countryCode: 'US', number: '5125550100' } } })
})

test('a contested dispute, or one without CONTEST in availableChoices, offers no evidence or contest buttons', async () => {
  const calls = []
  for (const dispute of [{ ...DISPUTE, availableChoices: undefined, sellerResponse: 'CONTEST' }, { ...DISPUTE, availableChoices: ['ACCEPT'] }]) {
    const c = client(calls, { gets: { '/payment_dispute/D1': dispute } })
    await assert.rejects(actions()['dispute-contest'].run(c, 'tok', 'D1', { note: 'x' }), (e) => e.status === 400)
    await assert.rejects(actions()['dispute-evidence'].run(c, 'tok', 'D1', { evidenceType: 'PROOF_OF_DELIVERY', file: { name: 'a.png', type: 'image/png', dataUrl: dataUrl('image/png', PNG) } }), (e) => e.status === 400)
  }
  assert.equal(calls.filter(([m]) => m !== 'GET').length, 0)
  const restore = stubModules({
    './helpers': {
      scopeAware: (fn) => fn,
      ebayApiz: () => APIZ,
      ebayGet: async (token, url) => {
        if (url.includes('payment_dispute_summary')) return { paymentDisputeSummaries: [
          { paymentDisputeId: 'D1', paymentDisputeStatus: 'ACTION_NEEDED', reason: 'ITEM_NOT_RECEIVED' },
          { paymentDisputeId: 'D2', paymentDisputeStatus: 'UNDER_REVIEW' },
          { paymentDisputeId: 'D3', paymentDisputeStatus: 'CLOSED' },
          { paymentDisputeId: 'D4', paymentDisputeStatus: 'ACTION_NEEDED', reason: 'SIGNIFICANTLY_NOT_AS_DESCRIBED' },
        ] }
        return { members: [], cancellations: [] }
      },
    },
  })
  try {
    const rows = (await freshRequire('marketplaces/ebay/sections/returns-cases.js')('tok')).tables.find((t) => t.id === 'disputes').rows
    const ids = (id) => rows.find((r) => r.id === id).actions.map((a) => a.id)
    assert.deepEqual(ids('D1'), ['dispute', 'dispute-evidence', 'dispute-contest', 'dispute-accept'])
    assert.deepEqual(ids('D2'), ['dispute'])
    assert.deepEqual(ids('D3'), ['dispute'])
    const evidence = rows[0].actions.find((a) => a.id === 'dispute-evidence')
    assert.deepEqual(evidence.input.fields.map((f) => [f.name, f.type || '']), [['evidenceType', ''], ['file', 'file']])
    assert.equal(evidence.input.fields[1].accept, 'image/jpeg,image/png')
    const snadContest = rows.find((r) => r.id === 'D4').actions.find((a) => a.id === 'dispute-contest')
    assert.ok(['fullName', 'addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country', 'primaryPhone'].every((n) => snadContest.input.fields.some((f) => f.name === n)))
  } finally { restore() }
})

test('the evidence photo goes to eBay as multipart with the field name file', async () => {
  const sent = []
  const realFetch = global.fetch
  global.fetch = async (url, opts) => { sent.push([url, opts]); return new Response(JSON.stringify({ fileId: 'F7' }), { status: 200 }) }
  try {
    const { ebayUpload } = freshRequire('marketplaces/ebay/client.js')
    const res = await ebayUpload('tok', `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/upload_evidence_file`, { name: 'pod.png', type: 'image/png', buffer: PNG })
    assert.deepEqual(res, { fileId: 'F7' })
    const [url, opts] = sent[0]
    assert.equal(url, `${APIZ}/sell/fulfillment/v1/payment_dispute/D1/upload_evidence_file`)
    assert.equal(opts.method, 'POST')
    assert.equal(opts.headers.Authorization, 'Bearer tok')
    const file = opts.body.get('file')
    assert.equal(file.name, 'pod.png')
    assert.equal(file.size, PNG.length)
  } finally { global.fetch = realFetch }
})
