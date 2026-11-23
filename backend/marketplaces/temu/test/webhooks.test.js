const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

process.env.TEMU_APP_KEY = 'demo-test-app'
process.env.TEMU_APP_SECRET = '12345678abcdefgh'

// Example push from Temu's Webhook Integration Guide.
const DOC_EVENT = 'sQmNTAKR2o4HrmCO3OchFgGyJU5Qta57+JQxxgVyVPU='
const DOC_HEADERS = { 'x-tm-app-key': 'demo-test-app', 'x-tm-event-code': 'bg_test_event', 'x-tm-timestamp': '1726127013525', 'x-tm-ext-param': '{}' }
const DOC_SIG = 'b5143d1a831453afbcf76d4621baa74a2dc07a486f26f5a956c6e50c61a338fb'

function load() {
  const queued = []
  const claims = new Set()
  const restore = stubModules({
    '/models/Shop': { findOne: (q) => ({ select: async () => (String(q.externalShopId) === '123456' ? { _id: 'shopA', name: 'Temu A', status: 'connected' } : null) }) },
    '/cache': { claim: async (k) => (claims.has(k) ? false : (claims.add(k), true)) },
    '/syncQueue': { enqueue: async (kind, id, opts) => { queued.push(`${kind}:${id}:${opts.push}`) } },
  })
  const t = freshRequire('marketplaces/temu/webhooks.js')
  return { t, queued, restore }
}

function push(t, code, data) {
  const key = Buffer.from(process.env.TEMU_APP_SECRET).subarray(0, 16)
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key)
  const plain = JSON.stringify(data)
  const eventData = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')
  const headers = { 'x-tm-app-key': 'demo-test-app', 'x-tm-event-code': code, 'x-tm-timestamp': String(Date.now()), 'x-tm-ext-param': '{}' }
  headers['x-tm-signature'] = t.expectedSignatures({ ...headers, eventData: plain })[1]
  return { body: JSON.stringify({ eventData }), headers }
}

test('decrypts the guide example', () => {
  const { t, restore } = load()
  try {
    assert.equal(t.decrypt(DOC_EVENT), '{"orderSn":"XXYYZZ","status":1}')
  } finally { restore() }
})

test('accepts the guide signature in lower and upper case', () => {
  const { t, restore } = load()
  try {
    for (const sig of [DOC_SIG, DOC_SIG.toUpperCase()]) {
      const opened = t.open({ eventData: DOC_EVENT }, { ...DOC_HEADERS, 'x-tm-signature': sig })
      assert.equal(opened.status, 200)
      assert.equal(opened.data.orderSn, 'XXYYZZ')
    }
  } finally { restore() }
})

test('rejects bad signature, other app key and undecryptable data with 401', () => {
  const { t, restore } = load()
  try {
    assert.equal(t.open({ eventData: DOC_EVENT }, { ...DOC_HEADERS, 'x-tm-signature': 'deadbeef' }).status, 401)
    assert.equal(t.open({ eventData: DOC_EVENT }, { ...DOC_HEADERS, 'x-tm-app-key': 'other', 'x-tm-signature': DOC_SIG }).status, 401)
    assert.equal(t.open({ eventData: 'bm90IGVuY3J5cHRlZA==' }, { ...DOC_HEADERS, 'x-tm-signature': DOC_SIG }).status, 401)
    assert.equal(t.open('nope', DOC_HEADERS).status, 400)
    assert.equal(t.open({}, DOC_HEADERS).status, 400)
  } finally { restore() }
})

test('queues an orders sync for each of the 5 event codes', async () => {
  const { t, queued, restore } = load()
  try {
    const codes = ['bg_order_status_change_event', 'bg_trade_logistics_address_changed', 'bg_aftersales_status_change', 'bg_cancel_order_status_change', 'bg_cooperative_warehouse_erp_fulfill_change_push']
    for (const [i, code] of codes.entries()) {
      const p = push(t, code, { mallId: 123456, parentOrderSn: `PO-${i}` })
      const r = await t.handle(p.body, p.headers)
      assert.equal(r.job, 'orders', r.message)
    }
    assert.equal(queued.length, 5)
    assert.ok(queued.every((q) => q === 'orders:shopA:true'))
  } finally { restore() }
})

test('ignores a duplicate push, an unknown mall and an unrelated event', async () => {
  const { t, queued, restore } = load()
  try {
    const p = push(t, 'bg_order_status_change_event', { mallId: 123456, parentOrderSn: 'PO-1' })
    assert.equal((await t.handle(p.body, p.headers)).job, 'orders')
    assert.match((await t.handle(p.body, p.headers)).message, /Duplicate/)
    const other = push(t, 'bg_order_status_change_event', { mallId: 999, parentOrderSn: 'PO-3' })
    assert.equal((await t.handle(other.body, other.headers)).job, undefined)
    const unrelated = push(t, 'bg_test_event', { orderSn: 'X' })
    assert.equal((await t.handle(unrelated.body, unrelated.headers)).job, undefined)
    assert.equal(queued.length, 1)
  } finally { restore() }
})

test('route answers {"result":{}} with 200 and 401 on a bad signature', async () => {
  const restore = stubModules({
    '/models/Shop': { findOne: () => ({ select: async () => null }) },
    '/cache': { claim: async () => true },
    '/syncQueue': { enqueue: async () => {} },
  })
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api', freshRequire('routes/system/api.js'))
  const server = app.listen(0)
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/temu/webhooks`
    const body = JSON.stringify({ eventData: DOC_EVENT })
    const ok = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...DOC_HEADERS, 'x-tm-signature': DOC_SIG }, body })
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { result: {} })
    const bad = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...DOC_HEADERS, 'x-tm-signature': 'bad' }, body })
    assert.equal(bad.status, 401)
  } finally {
    server.close()
    restore()
  }
})
