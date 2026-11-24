const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }
// The shop's stored Temu goods: goods 1 has two SKU rows, goods 2 and 3 one each; goods 9 isn't in the dashboard.
const LISTINGS = [{ externalListingId: '1:11' }, { externalListingId: '1:12' }, { externalListingId: '2:21' }, { externalListingId: '3' }]

function load(answers, { cache = new Map(), shop = { _id: 's1', marketplace: 'temu', status: 'connected' } } = {}) {
  const calls = []
  const restore = stubModules({
    '/models/Shop': { findOne: () => chain(shop) },
    '/models/Listing': { find: () => chain(LISTINGS) },
    '../manager': { withShopToken: async (s, fn) => fn('tok') },
    '../../service': {
      call: async (method, params) => {
        calls.push([method, params])
        const a = answers[method]
        if (a instanceof Error) throw a
        return a || {}
      },
    },
    '/core/cache': { get: async (k) => cache.get(k), set: async (k, v) => { cache.set(k, v) } },
  })
  return { service: freshRequire('marketplaces/temu/app/services/goodsSignals.js'), calls, restore }
}

test("signals for the dashboard's goods only, totals counted per row like the pills", async () => {
  const { service, calls, restore } = load({
    'temu.local.goods.list.retrieve': { goodsList: [{ goodsId: 1, restrictedTrafficTag: 1 }, { goodsId: 2, lowTrafficTag: 1 }, { goodsId: 9, restrictedTrafficTag: 1 }] },
    'bg.local.compliance.goods.list.query': { goodsList: [{ goodsId: 2, certificateInfoList: [{ certType: 1, status: 3 }] }, { goodsId: 3, certificateInfoList: [] }], total: 2 },
    'bg.local.goods.priceorder.query': { list: [{ goodsId: 3, status: 101 }] },
  })
  try {
    const out = await service.signals(admin)
    assert.deepEqual(out.goods, { 1: { traffic: 'Traffic restricted' }, 2: { traffic: 'Low traffic', compliance: true }, 3: { priceReview: true } })
    assert.deepEqual(out.totals, { restricted: 2, low: 1, compliance: 1, priceReview: 1 })
    const price = calls.find(([m]) => m === 'bg.local.goods.priceorder.query')[1]
    assert.equal(price.status, 101, 'only price orders awaiting the seller (Temu code 101)')
  } finally { restore() }
})

test('a result with a failed call is not cached; a complete one is', async () => {
  const cache = new Map()
  const failing = load({ 'temu.local.goods.list.retrieve': new Error('rate limited') }, { cache })
  try {
    assert.deepEqual((await failing.service.signals(admin)).unavailable, ['traffic'])
    assert.equal(cache.size, 0)
  } finally { failing.restore() }
  const ok = load({}, { cache })
  try {
    await ok.service.signals(admin)
    const n = ok.calls.length
    await ok.service.signals(admin)
    assert.equal(ok.calls.length, n)
  } finally { ok.restore() }
})

test("methods the shop's token lacks are not called", async () => {
  const { service, calls, restore } = load({}, { shop: { _id: 's1', marketplace: 'temu', status: 'connected', grantedScopes: ['bg.local.compliance.goods.list.query'] } })
  try {
    const out = await service.signals(admin)
    assert.deepEqual(calls.map(([m]) => m), ['bg.local.compliance.goods.list.query'])
    assert.deepEqual(out.unavailable, ['priceReviews', 'traffic'])
  } finally { restore() }
})

test('price-review signals ask Temu for both statuses that wait for the seller (101 and 202)', async () => {
  const { service, calls, restore } = load({ 'bg.local.goods.priceorder.query': { list: [{ goodsId: 2 }] } })
  try {
    await service.signals(admin)
    assert.deepEqual(calls.filter(([m]) => m === 'bg.local.goods.priceorder.query').map(([, p]) => p.status).sort(), [101, 202])
  } finally { restore() }
})
