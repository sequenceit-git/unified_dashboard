const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const REPLIES = {
  'bg.local.goods.detail.query': { goodsId: 77, goodsName: 'Phone case', catName: 'Cases', goodsGallery: { detailImage: ['https://img/1.jpg'] }, goodsProperties: [{ name: 'Material', value: 'TPU' }], skuList: [{ skuId: 1, specNameList: ['Red'], price: { amount: '9.99', currency: 'USD' }, outSkuSn: 'CASE-RED' }] },
  'bg.local.goods.sku.list.query': { skuList: [{ skuId: 1, goodsId: 77, specName: 'Red', price: '9.99', currency: 'USD', stock: 4, skuSn: 'CASE-RED' }, { skuId: 2, goodsId: 77, specName: 'Blue', price: '9.99', currency: 'USD', stock: 0, skuSn: '' }] },
}

function load({ publish, check, set, calls }) {
  return stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '/models/Listing': modelStub(() => ({ _id: 'l1', externalListingId: '77:1' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'bg.local.goods.publish.status.get') return { goodsPublishStatusList: [publish] }
        if (type === 'bg.local.goods.sku.out.sn.check') return { resultList: check(body) }
        if (type === 'bg.local.goods.sku.out.sn.set') return { resultList: set(body) }
        return REPLIES[type]
      },
    },
  })
}
const admin = (params, body = {}) => ({ user: { role: 'super_admin' }, params, query: {}, body })

test('goods detail joins goods, SKUs and publication status', async () => {
  const calls = []
  const restore = load({ calls, publish: { goodsId: 77, status: 2, subStatus: 8 } })
  try {
    const service = freshRequire('marketplaces/temu/app/services/products.js')
    const res = await service.temuDetail(admin({ goodsId: '77' }))
    assert.deepEqual(res.goods, { title: 'Phone case', category: 'Cases', images: ['https://img/1.jpg'], attributes: [{ name: 'Material', value: 'TPU' }] })
    assert.deepEqual(res.skus.map((s) => [s.skuId, s.spec, s.price.value, s.stock, s.sellerCode]), [['1', 'Red', 9.99, 4, 'CASE-RED'], ['2', 'Blue', 9.99, 0, '']])
    assert.deepEqual(res.status, { state: 'Active', detail: 'On-shelf' })
    assert.ok(calls.every(([, body]) => body.access_token === 'tok'))
  } finally { restore() }
})

test("a rejected goods shows Temu's reason", async () => {
  const restore = load({ calls: [], publish: { goodsId: 77, status: 3, subStatus: 9 } })
  try {
    const service = freshRequire('marketplaces/temu/app/services/products.js')
    const res = await service.temuDetail(admin({ goodsId: '77' }))
    assert.deepEqual(res.status, { state: 'Inactive', detail: 'Price assessment rejected' })
  } finally { restore() }
})

test('seller codes are checked before they are set', async () => {
  const calls = []
  const restore = load({ calls, publish: {}, check: (b) => b.outSkuSnList.map((sn) => ({ outSkuSn: sn, isDuplicate: false })), set: (b) => b.modifyList.map((m) => ({ ...m, modifySuccess: true })) })
  try {
    const service = freshRequire('marketplaces/temu/app/services/products.js')
    const res = await service.setSkuCodes(admin({ goodsId: '77' }, { codes: [{ skuId: '1', code: ' CASE-RED ' }, { skuId: '2', code: 'CASE-BLUE' }] }))
    assert.deepEqual(calls.map(([t]) => t), ['bg.local.goods.sku.out.sn.check', 'bg.local.goods.sku.out.sn.set'])
    assert.deepEqual(calls[1][1].modifyList, [{ goodsId: 77, skuId: 1, outSkuSn: 'CASE-RED' }, { goodsId: 77, skuId: 2, outSkuSn: 'CASE-BLUE' }])
    assert.equal(res.message, 'Saved 2 seller codes on Temu.')
  } finally { restore() }
})

test('a duplicate code is refused without setting any', async () => {
  const calls = []
  const restore = load({ calls, publish: {}, check: (b) => b.outSkuSnList.map((sn) => ({ outSkuSn: sn, isDuplicate: sn === 'TAKEN', duplicateSkuId: 900 })), set: () => [] })
  try {
    const service = freshRequire('marketplaces/temu/app/services/products.js')
    await assert.rejects(service.setSkuCodes(admin({ goodsId: '77' }, { codes: [{ skuId: '1', code: 'OK-1' }, { skuId: '2', code: 'TAKEN' }] })), (e) => e.status === 400 && /TAKEN/.test(e.body.error))
    assert.deepEqual(calls.map(([t]) => t), ['bg.local.goods.sku.out.sn.check'])
  } finally { restore() }
})
