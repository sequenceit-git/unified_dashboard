const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

process.env.TIKTOK_SHOP_APP_KEY = 'tt-key'
process.env.TIKTOK_SHOP_APP_SECRET = 'tt-secret'

function load() {
  const queued = []
  const restore = stubModules({
    '/models/Shop': { findOne: () => ({ select: async () => ({ _id: 'shopT', name: 'TT', status: 'connected' }) }), find: () => ({ select: () => ({ limit: async () => [] }) }), updateOne: async () => ({}) },
    '/cache': { claim: async () => true },
    '/syncQueue': { enqueue: async (kind, id) => { queued.push(`${kind}:${id}`) } },
  })
  return { n: freshRequire('marketplaces/tiktok_shop/webhooks.js'), queued, restore }
}

const sign = (body) => crypto.createHmac('sha256', 'tt-secret').update(Buffer.concat([Buffer.from('tt-key'), Buffer.from(body)])).digest('hex')

test('verify accepts HMAC-SHA256 of appKey + raw body', () => {
  const { n, restore } = load()
  try {
    const body = '{"type":1,"shop_id":"7","data":{"order_id":"1"}}'
    assert.equal(n.verify(Buffer.from(body), sign(body)), true)
  } finally { restore() }
})

test('verify rejects a tampered body', () => {
  const { n, restore } = load()
  try {
    const body = '{"type":1,"shop_id":"7"}'
    assert.equal(n.verify(Buffer.from(`${body} `), sign(body)), false)
  } finally { restore() }
})

test('resolveKind maps topics to sync kinds', () => {
  const { n, restore } = load()
  try {
    assert.equal(n.resolveKind('ORDER_STATUS_CHANGE', {}), 'orders')
    assert.equal(n.resolveKind('PRODUCT_STATUS_CHANGE', {}), 'listings')
    assert.equal(n.resolveKind('NEW_MESSAGE', {}), 'inbox')
    assert.equal(n.resolveKind('SELLER_DEAUTHORIZATION', {}), 'deauth')
    assert.equal(n.resolveKind('', { data: { order_id: '1' } }), 'orders')
  } finally { restore() }
})

test('handle queues the sync for a signed order event', async () => {
  const { n, queued, restore } = load()
  try {
    const body = '{"type":1,"shop_id":"7","tts_notification_id":"n1","data":{"order_id":"1"}}'
    const r = await n.handle(Buffer.from(body), JSON.parse(body), sign(body), 'ORDER_STATUS_CHANGE')
    assert.equal(r.status, 200)
    assert.equal(r.job, 'orders')
    assert.deepEqual(queued, ['orders:shopT'])
    assert.equal((await n.handle(Buffer.from(body), JSON.parse(body), 'bad', '')).status, 401)
  } finally { restore() }
})
