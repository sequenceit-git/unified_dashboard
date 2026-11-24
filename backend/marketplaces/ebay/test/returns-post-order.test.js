const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const USD = (v) => ({ value: String(v), currency: 'USD' })
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const photo = { name: 'box.png', type: 'image/png', dataUrl: `data:image/png;base64,${PNG.toString('base64')}` }
const RETURN = {
  summary: { returnId: 'R1', state: 'ITEM_SHIPPED', status: 'ITEM_SHIPPED', buyerLoginName: 'amy', creationInfo: { reason: 'DEFECTIVE_ITEM', comments: { content: 'Cracked' } }, sellerTotalRefund: { estimatedRefundAmount: USD(20) } },
  detail: {
    responseHistory: [{ creationDate: { value: '2026-11-20T00:00:00.000Z' }, activity: 'BUYER_CREATE_RETURN', author: 'BUYER', notes: 'Cracked' }],
    returnShipmentInfo: { shipmentTracking: { carrierEnum: 'USPS', trackingNumber: '9400' } },
  },
}

function client(calls, gets = {}) {
  const pick = (url) => gets[Object.keys(gets).find((k) => url.includes(k))]
  return {
    apiz: 'https://apiz.ebay.com',
    ebaySend: async (token, method, url, body) => { calls.push([method, url, body]); return {} },
    postOrder: async (token, path, opts) => { calls.push([opts.method, path, opts.body]); return pick(path) || (path.endsWith('/file/upload') ? { fileId: 'FILE1' } : {}) },
  }
}
const actions = () => freshRequire('marketplaces/ebay/sections/returnsActions.js').ACTIONS

test("a return's detail shows its history, files and tracking", async () => {
  const urls = []
  const restore = stubModules({
    './helpers': {
      scopeAware: (fn) => fn,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url, opts) => {
        urls.push([url, opts?.iaf])
        if (url.includes('/files')) return { files: [{ fileId: 'F1', fileName: 'photo1.jpg', filePurpose: 'ITEM_RELATED', fileStatus: 'SUBMITTED', creationDate: { value: '2026-11-21T00:00:00.000Z' } }] }
        if (url.includes('/tracking')) return { carrier: 'USPS', trackingNumber: '9400', trackingStatus: 'IN_TRANSIT', scanHistory: [{ eventDesc: 'Accepted', eventTime: { value: '2026-11-22T00:00:00.000Z' }, eventCity: 'Austin' }] }
        return RETURN
      },
    },
  })
  try {
    const detail = await freshRequire('marketplaces/ebay/sections/returns-cases.js').details.return('tok', {}, 'R1')
    assert.deepEqual(urls, [
      ['/post-order/v2/return/R1', true], ['/post-order/v2/return/R1/files', true],
      ['/post-order/v2/return/R1/tracking?carrier_used=USPS&tracking_number=9400', true],
    ])
    assert.deepEqual(detail.tables.map((t) => t.id), ['history', 'files', 'tracking'])
    assert.deepEqual([detail.tables[0].rows[0].what, detail.tables[0].rows[0].who, detail.tables[0].rows[0].notes], ['Buyer create return', 'Buyer', 'Cracked'])
    assert.equal(detail.tables[1].rows[0].name, 'photo1.jpg')
    assert.equal(detail.tables[2].rows[0].event, 'Accepted (Austin)')
    assert.ok(detail.summary.some((s) => s.label === 'Reason' && /Defective item: Cracked/.test(s.value)))
  } finally { restore() }
})

test('a message to the buyer is sent on the return', async () => {
  const calls = []
  await actions()['return-message'].run(client(calls), 'tok', 'R1', { message: ' Please use the label ' })
  assert.deepEqual(calls, [['POST', '/post-order/v2/return/R1/send_message', { message: { content: 'Please use the label' } }]])
  for (const message of ['', 'x'.repeat(1001)]) await assert.rejects(actions()['return-message'].run(client(calls), 'tok', 'R1', { message }), (e) => e.status === 400)
  assert.equal(calls.length, 1)
})

test('a photo is uploaded then submitted', async () => {
  const calls = []
  await actions()['return-photo'].run(client(calls), 'tok', 'R1', { file: photo })
  assert.deepEqual(calls, [
    ['POST', '/post-order/v2/return/R1/file/upload', { fileName: 'box.png', data: PNG.toString('base64'), filePurpose: 'ITEM_RELATED' }],
    ['POST', '/post-order/v2/return/R1/file/submit', { filePurpose: 'ITEM_RELATED' }],
  ])
  await assert.rejects(actions()['return-photo'].run(client(calls), 'tok', 'R1', { file: { name: 'a.pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' } }), (e) => e.status === 400)
  assert.equal(calls.length, 2)
})

test('sending a return label passes carrier and tracking', async () => {
  const calls = []
  await actions()['return-label'].run(client(calls), 'tok', 'R1', { carrier: 'FedEx', trackingNumber: ' 7788 ' })
  assert.deepEqual(calls, [['POST', '/post-order/v2/return/R1/add_shipping_label', { carrierEnum: 'FEDEX', trackingNumber: '7788' }]])
  await assert.rejects(actions()['return-label'].run(client(calls), 'tok', 'R1', { carrier: 'Pigeon', trackingNumber: '1' }), (e) => e.status === 400)
})

test('escalating asks eBay to step in with the chosen reason', async () => {
  const calls = []
  await actions()['return-escalate'].run(client(calls), 'tok', 'R1', { reason: 'BUYER_RETURNED_WRONG_ITEM', comments: 'Different serial' })
  assert.deepEqual(calls, [['POST', '/post-order/v2/return/R1/escalate', { reason: 'BUYER_RETURNED_WRONG_ITEM', comments: { content: 'Different serial' } }]])
  await assert.rejects(actions()['return-escalate'].run(client(calls), 'tok', 'R1', { reason: 'NOPE' }), (e) => e.status === 400)
})

test('closed or refunded returns offer only Details', async () => {
  const restore = stubModules({
    './helpers': {
      scopeAware: (fn) => fn,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url) => (url.includes('/return/search') ? { members: [
        { returnId: 'R1', status: 'RETURN_REQUESTED', state: 'RETURN_REQUESTED' },
        { returnId: 'R2', status: 'ITEM_SHIPPED', state: 'ITEM_SHIPPED' },
        { returnId: 'R3', status: 'CLOSED', state: 'CLOSED' },
        { returnId: 'R4', status: 'REFUND_INITIATED', state: 'REFUND_INITIATED' },
      ] } : { members: [], cancellations: [], paymentDisputeSummaries: [] }),
    },
  })
  try {
    const rows = (await freshRequire('marketplaces/ebay/sections/returns-cases.js')('tok')).tables.find((t) => t.id === 'returns').rows
    const ids = (id) => rows.find((r) => r.id === id).actions.map((a) => a.id)
    assert.deepEqual(ids('R1'), ['return', 'return-message', 'return-photo', 'return-label', 'return-escalate', 'refund'])
    assert.deepEqual(ids('R2'), ['return', 'return-message', 'return-photo', 'return-escalate', 'mark-received', 'refund'])
    assert.deepEqual(ids('R3'), ['return'])
    assert.deepEqual(ids('R4'), ['return'])
  } finally { restore() }
})
