const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const USD = (a) => ({ amount: a, currency: 'USD' })
const DETAIL = { parentOrderMap: { parentOrderSn: 'PO-1', parentOrderStatus: 2, parentOrderTime: 1764000000, parentShippingTime: 1764100000, expectShipLatestTime: 1764200000 }, orderList: [{ orderSn: 'O-1', goodsId: 77, skuId: 1, goodsName: 'Phone case', spec: 'Red', quantity: 2 }] }
const AMOUNT = { parentOrderMap: { parentOrderSn: 'PO-1', customerPaid: { retailPriceTotalTaxIncl: USD(20), retailPriceSellerDiscountTaxExcl: USD(2), retailPriceTemuDiscountTaxExcl: USD(1), shippingTotalTaxIncl: USD(3), customerPaidTotal: USD(20) }, salesProceeds: { estimatedSettlementTotal: USD(15) } }, orderList: [{ orderSn: 'O-1', unitRetailPrice: USD(10) }] }

function load({ order, calls, cacheCalls, saves }) {
  return stubModules({
    '/models/Order': modelStub(() => order, { updateOne: async () => { saves.push(1) } }),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    'services/core/cache': { get: async () => { cacheCalls.push('get') }, set: async () => { cacheCalls.push('set') }, del: async () => {}, claim: async () => true },
    '../../service': {
      call: async (type, body) => {
        calls.push([type, body.parentOrderSn])
        if (type === 'bg.order.detail.v2.get') return DETAIL
        if (type === 'temu.order.amount.v2.query') return AMOUNT
        if (type === 'bg.order.decryptshippinginfo.get') return { receiptName: 'Ann Lee', mobile: '+1 555 0100', addressLine1: '1 Main St', addressLine2: 'Apt 2', regionName3: 'Austin', regionName2: 'TX', postCode: '78701', regionName1: 'US' }
        throw new Error(`unexpected ${type}`)
      },
    },
  })
}
const ORDER = { _id: 'o1', shopId: 's1', externalOrderId: 'PO-1', marketplace: 'temu', save: async () => { throw new Error('must not save') } }

test('order detail lists items and amounts', async () => {
  const calls = []
  const restore = load({ order: ORDER, calls, cacheCalls: [], saves: [] })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    const res = await service.temuDetail({ user: { role: 'super_admin' }, params: { id: 'o1' }, query: {}, body: {} })
    assert.deepEqual(res.items, [{ goodsId: '77', skuId: '1', title: 'Phone case', spec: 'Red', qty: 2, price: { value: 10, currency: 'USD' } }])
    assert.deepEqual(res.amounts.map((l) => [l.label, l.amount.value]), [['Products', 20], ['Seller discount', -2], ['Temu discount', -1], ['Shipping', 3], ['Buyer paid', 20], ['Estimated settlement to you', 15]])
    assert.deepEqual(calls.map(([t, sn]) => [t, sn]), [['bg.order.detail.v2.get', 'PO-1'], ['temu.order.amount.v2.query', 'PO-1']])
  } finally { restore() }
})

test('full address is fetched only on request and not cached', async () => {
  const calls = []
  const cacheCalls = []
  const saves = []
  const restore = load({ order: ORDER, calls, cacheCalls, saves })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    await service.temuDetail({ user: { role: 'super_admin' }, params: { id: 'o1' }, query: {}, body: {} })
    assert.ok(!calls.some(([t]) => t === 'bg.order.decryptshippinginfo.get'), 'the detail never decrypts')
    const res = await service.fullAddress({ user: { role: 'super_admin' }, params: { id: 'o1' }, query: {}, body: {} })
    assert.deepEqual(res, { name: 'Ann Lee', phone: '+1 555 0100', address: '1 Main St, Apt 2, Austin, TX 78701, US' })
    assert.deepEqual(cacheCalls, [])
    assert.deepEqual(saves, [])
  } finally { restore() }
})

test('full address needs orders permission', async () => {
  const calls = []
  const restore = load({ order: ORDER, calls, cacheCalls: [], saves: [] })
  try {
    const service = freshRequire('marketplaces/temu/app/services/orders.js')
    const noOrders = { user: { id: 'u2', role: 'sub_admin', mainRoutes: ['products'] }, allowedShopIds: ['s1'], params: { id: 'o1' }, query: {}, body: {} }
    await assert.rejects(service.fullAddress(noOrders), (e) => e.status === 403)
    const otherShop = { user: { id: 'u3', role: 'sub_admin', mainRoutes: ['orders'] }, allowedShopIds: ['s9'], params: { id: 'o1' }, query: {}, body: {} }
    await assert.rejects(service.fullAddress(otherShop), (e) => e.status === 403)
    assert.equal(calls.length, 0)
  } finally { restore() }
})
