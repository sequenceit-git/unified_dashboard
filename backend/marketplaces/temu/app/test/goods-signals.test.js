const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../../test/helpers/stub')

const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'sort', 'limit', 'lean']) p[m] = () => p; return p }
const admin = { user: { id: 'u1', role: 'super_admin' }, query: {}, body: {}, params: {} }

function load(answers, cache = new Map()) {
  const calls = []
  const restore = stubModules({
    '/models/Shop': { findOne: () => chain({ _id: 's1', marketplace: 'temu', status: 'connected' }) },
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': {
      call: async (method) => {
        calls.push(method)
        const a = answers[method]
        if (a instanceof Error) throw a
        return a || {}
      },
    },
    '/core/cache': { wrap: async (key, ttl, fn) => { if (!cache.has(key)) cache.set(key, await fn()); return cache.get(key) } },
  })
  return { service: freshRequire('marketplaces/temu/app/services/goodsSignals.js'), calls, restore }
}

test("each goods' Temu signals: traffic, certificates, price reviews", async () => {
  const { service, restore } = load({
    'temu.local.goods.list.retrieve': { goodsList: [{ goodsId: 1, restrictedTrafficTag: 1 }, { goodsId: 2, lowTrafficTag: 1 }, { goodsId: 3 }] },
    'bg.local.compliance.goods.list.query': { goodsList: [{ goodsId: 2, certificateInfoList: [] }, { goodsId: 3, certificateInfoList: [{ certType: 1 }] }], total: 2 },
    'bg.local.goods.priceorder.query': { list: [{ goodsId: 3, priceOrderStatus: 'WAIT_CONFIRM' }, { goodsId: 1, priceOrderStatus: 'APPROVED' }] },
  })
  try {
    const out = await service.signals(admin)
    assert.deepEqual(out.goods, {
      1: { traffic: 'Traffic restricted' },
      2: { traffic: 'Low traffic', certNeeded: true },
      3: { priceReview: true },
    })
    assert.deepEqual(out.unavailable, [])
  } finally { restore() }
})

test('a Temu call that fails leaves the other signals and is named', async () => {
  const { service, restore } = load({
    'temu.local.goods.list.retrieve': new Error('no permission'),
    'bg.local.compliance.goods.list.query': { goodsList: [{ goodsId: 2, certificateInfoList: [] }], total: 1 },
  })
  try {
    const out = await service.signals(admin)
    assert.deepEqual(out.goods, { 2: { certNeeded: true } })
    assert.deepEqual(out.unavailable, ['traffic'])
  } finally { restore() }
})

test('signals are cached per shop (Temu is asked once)', async () => {
  const cache = new Map()
  const { service, calls, restore } = load({ 'temu.local.goods.list.retrieve': { goodsList: [] } }, cache)
  try {
    await service.signals(admin)
    const n = calls.length
    await service.signals(admin)
    assert.equal(calls.length, n)
  } finally { restore() }
})
