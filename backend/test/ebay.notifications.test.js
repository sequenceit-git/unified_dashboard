const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { stubModules, freshRequire } = require('./helpers/stub')

process.env.EBAY_DEV_ID = 'dev'
process.env.EBAY_CLIENT_ID = 'app'
process.env.EBAY_CLIENT_SECRET = 'cert'

function load() {
  const queued = []
  const restore = stubModules({
    '/models/Shop': { findOne: () => ({ select: async () => ({ _id: 'shopE', name: 'eBay A', marketplace: 'ebay' }) }), find: () => ({ select: () => ({ limit: async () => [] }) }), updateOne: async () => ({}) },
    './syncQueue': { enqueue: async (kind, id) => { queued.push(`${kind}:${id}`) } },
  })
  return { n: freshRequire('services/ebayNotifications.js'), queued, restore }
}

function soap(event, { timestamp = new Date().toISOString(), signature } = {}) {
  const sig = signature ?? crypto.createHash('md5').update(`${timestamp}devappcert`).digest('base64')
  return `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header><ebl:RequesterCredentials xmlns:ebl="urn:ebay:apis:eBLBaseComponents"><ebl:NotificationSignature>${sig}</ebl:NotificationSignature></ebl:RequesterCredentials></soapenv:Header><soapenv:Body><GetItemTransactionsResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Timestamp>${timestamp}</Timestamp><NotificationEventName>${event}</NotificationEventName><RecipientUserID>seller1</RecipientUserID></GetItemTransactionsResponse></soapenv:Body></soapenv:Envelope>`
}

test('handle rejects a request with a bad signature', async () => {
  const { n, queued, restore } = load()
  try {
    const r = await n.handle(soap('FixedPriceTransaction', { signature: 'bad' }), '')
    assert.equal(r.status, 401)
    assert.deepEqual(queued, [])
  } finally { restore() }
})

test('maps an ItemSold / FixedPriceTransaction notification to an orders sync', async () => {
  const { n, queued, restore } = load()
  try {
    for (const event of ['FixedPriceTransaction', 'ItemSold']) {
      const r = await n.handle(soap(event), '')
      assert.equal(r.status, 200, r.message)
      assert.equal(r.job, 'orders')
    }
    assert.deepEqual(queued, ['orders:shopE', 'orders:shopE'])
  } finally { restore() }
})

test('maps message and listing events, ignores unknown ones', async () => {
  const { n, restore } = load()
  try {
    assert.equal((await n.handle(soap('MyMessagesM2MMessage'), '')).job, 'inbox')
    assert.equal((await n.handle(soap('ItemRevised'), '')).job, 'listings')
    const r = await n.handle(soap('SomethingElse'), '')
    assert.equal(r.status, 200)
    assert.equal(r.job, undefined)
  } finally { restore() }
})
