const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

/** Sales service with one in-memory order and a recording marketplace manager. */
function load(order, { failMarketplace = false } = {}) {
  const calls = []
  const doc = order && { returns: [], ...order, save: async () => { calls.push(['save', { ...doc }]) } }
  const Order = {
    findOne: async () => doc || null,
    findById: async () => doc || null,
    // Like Mongoose: returns a new document; the one already loaded is not changed.
    findOneAndUpdate: async (q, update) => (doc ? { ...doc, ...update } : null),
  }
  const fail = async () => { throw new Error('API down') }
  const manager = {
    cancelOrder: failMarketplace ? fail : async (o, opts) => { calls.push(['cancelOrder', o._id, opts]); return { success: true } },
    pushShipping: failMarketplace ? fail : async (o, opts) => { calls.push(['pushShipping', o._id, opts]); return { pushed: true } },
    processRefund: failMarketplace ? fail : async (o, opts) => { calls.push(['processRefund', o._id, opts]); return { success: true } },
  }
  const restore = stubModules({
    '/models/Order': Order,
    '/models/Shop': {},
    '../../services/marketplace': manager,
    '../marketplace': manager,
    '../manager': manager,
    '/core/syncQueue': { enqueue: async (kind, id) => { calls.push(['enqueue', kind, id]) } },
    '/core/cache': { invalidate: async () => {} },
    '/core/events': { publish: async () => {} },
  })
  const service = freshRequire('marketplaces/temu/app/services/orders.js')
  return { service, calls, doc, restore }
}

const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: { id: 'o1' } }

test('cancelling calls the marketplace and marks the order cancelled', async () => {
  const { service, calls, doc, restore } = load({ _id: 'o1', shopId: 's1', status: 'paid', marketplace: 'temu' })
  try {
    const out = await service.updateStatus({ ...admin, body: { status: 'cancelled' } })
    assert.deepEqual(calls[0], ['cancelOrder', 'o1', { reason: 'BUYER_ASKED_CANCEL', comment: 'Cancelled from dashboard' }])
    assert.equal(out.status, 'cancelled')
    assert.equal(doc.status, 'paid')
    assert.deepEqual(calls.find((c) => c[0] === 'enqueue'), ['enqueue', 'listings', 's1'])
  } finally { restore() }
})

test('a shipped order cannot be cancelled (400) and a marketplace failure is a 502', async () => {
  let ctx = load({ _id: 'o1', status: 'shipped', marketplace: 'ebay' })
  try {
    await assert.rejects(ctx.service.updateStatus({ ...admin, body: { status: 'cancelled' } }), (e) => e.status === 400)
  } finally { ctx.restore() }
  ctx = load({ _id: 'o1', status: 'paid', marketplace: 'ebay' }, { failMarketplace: true })
  try {
    await assert.rejects(ctx.service.updateStatus({ ...admin, body: { status: 'cancelled' } }), (e) => e.status === 502 && /ebay could not cancel this order: API down/.test(e.body.error))
  } finally { ctx.restore() }
})

test('shipping pushes tracking, stores it and marks the order shipped', async () => {
  const { service, calls, doc, restore } = load({ _id: 'o1', status: 'paid', marketplace: 'temu' })
  try {
    const out = await service.updateShipping({ ...admin, body: { carrier: 'USPS', trackingNumber: '9400' } })
    assert.deepEqual(calls[0], ['pushShipping', 'o1', { carrier: 'USPS', trackingNumber: '9400' }])
    assert.equal(doc.status, 'shipped')
    assert.equal(doc.shipping.trackingNumber, '9400')
    assert.equal(doc.shipping.trackingVerified, true)
    assert.deepEqual(out.marketplacePush, { pushed: true })
  } finally { restore() }
})

test('a rejected tracking push is a 502 with marketplacePush in the body', async () => {
  const { service, restore } = load({ _id: 'o1', status: 'paid', marketplace: 'temu' }, { failMarketplace: true })
  try {
    await assert.rejects(service.updateShipping({ ...admin, body: { trackingNumber: '1' } }), (e) => e.status === 502 && e.body.marketplacePush.pushed === false)
  } finally { restore() }
})

test('refund forwards the amount and marks a full refund as refunded', async () => {
  const { service, calls, doc, restore } = load({ _id: 'o1', shopId: 's1', status: 'paid', marketplace: 'temu', totals: { total: 20 } })
  try {
    await service.refund({ ...admin, body: { amount: '20', reason: 'Damaged' } })
    assert.deepEqual(calls[0], ['processRefund', 'o1', { reason: 'Damaged', comment: undefined, amount: 20 }])
    assert.equal(doc.status, 'refunded')
    assert.equal(doc.returns[0].refundAmount, 20)
  } finally { restore() }
})

test('a sub-admin cannot refund an order of a shop outside their access (403)', async () => {
  const { service, restore } = load({ _id: 'o1', shopId: 's9', marketplace: 'temu', totals: { total: 5 } })
  try {
    const sub = { user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], query: {}, body: {}, params: { id: 'o1' } }
    await assert.rejects(service.refund(sub), (e) => e.status === 403)
  } finally { restore() }
})
