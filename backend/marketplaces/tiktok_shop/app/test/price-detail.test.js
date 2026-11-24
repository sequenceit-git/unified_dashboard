const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const PRICE = {
  currency: 'USD', sku_list_price: '40', subtotal_deduction_seller: '4', voucher_deduction_seller: '1', subtotal_deduction_platform: '3', voucher_deduction_platform: '0',
  shipping_list_price: '6', shipping_fee_deduction_seller: '1', shipping_fee_deduction_platform: '2', shipping_fee_deduction_platform_voucher: '0', tax_amount: '2.5', payment: '37.5',
}

function load({ order, calls }) {
  return stubModules({
    '/models/Order': modelStub((q) => (order && (!q?.shopId || q.shopId.$in?.map(String).includes(String(order.shopId))) ? order : null)),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async (token, method, path, opts) => { calls.push([method, path, opts.shop?._id]); return PRICE } },
  })
}

test('price detail lists discounts, shipping and tax', async () => {
  const calls = []
  const restore = load({ order: { _id: 'o1', shopId: 's1', externalOrderId: '5770', marketplace: 'tiktok_shop' }, calls })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/orders.js')
    const res = await service.priceDetail({ user: { role: 'super_admin' }, params: { id: 'o1' }, query: {}, body: {} })
    assert.deepEqual(calls, [['GET', '/order/202407/orders/5770/price_detail', 's1']])
    assert.deepEqual(res.lines.map((l) => [l.label, l.amount.value]), [
      ['Products (list price)', 40], ['Seller discounts', -5], ['TikTok discounts', -3], ['Shipping', 6], ['Shipping discounts (seller)', -1], ['Shipping discounts (TikTok)', -2], ['Tax', 2.5],
    ])
    assert.deepEqual(res.total, { label: 'Buyer paid', amount: { value: 37.5, currency: 'USD' } })
  } finally { restore() }
})

test('an order of another shop is refused', async () => {
  const calls = []
  const restore = load({ order: { _id: 'o1', shopId: 's9', externalOrderId: '5770', marketplace: 'tiktok_shop' }, calls })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/orders.js')
    const sub = { user: { id: 'u2', role: 'sub_admin' }, allowedShopIds: ['s1'], params: { id: 'o1' }, query: {}, body: {} }
    await assert.rejects(service.priceDetail(sub), (e) => e.status === 404 || e.status === 403)
    assert.equal(calls.length, 0)
  } finally { restore() }
})

test('the breakdown lines always add up to what the buyer paid', async () => {
  const restore = stubModules({
    '/models/Order': modelStub(() => ({ _id: 'o1', shopId: 's1', externalOrderId: '5770', marketplace: 'tiktok_shop' })),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'tiktok_shop', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': { call: async () => ({ ...PRICE, cod_fee: '1.25', distance_shipping_fee: '0.75', payment: '39.5' }) },
  })
  try {
    const service = freshRequire('marketplaces/tiktok_shop/app/services/orders.js')
    const res = await service.priceDetail({ user: { role: 'super_admin' }, params: { id: 'o1' }, query: {}, body: {} })
    const sum = Math.round(res.lines.reduce((t, l) => t + l.amount.value, 0) * 100) / 100
    assert.equal(sum, 39.5)
    assert.deepEqual(res.lines.at(-1), { label: 'Other fees and adjustments', amount: { value: 2, currency: 'USD' } })
  } finally { restore() }
})
