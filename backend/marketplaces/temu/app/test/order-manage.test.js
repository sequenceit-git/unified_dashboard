const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const ORDER = { _id: 'o1', shopId: 's1', externalOrderId: 'PO-1', marketplace: 'temu' }
const DETAIL = { parentOrderMap: { parentOrderSn: 'PO-1' }, orderList: [{ orderSn: 'O-1', goodsName: 'Mug' }, { orderSn: 'O-2', goodsName: 'Cup' }] }

function load(replies, calls = []) {
  const restore = stubModules({
    '/models/Order': modelStub(() => ORDER),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../service': {
      call: async (type, body) => {
        calls.push([type, body])
        const r = replies[type]
        if (r instanceof Error) throw r
        if (r === undefined) throw new Error(`unexpected ${type}`)
        return typeof r === 'function' ? r(body) : r
      },
    },
  })
  return { orders: freshRequire('marketplaces/temu/app/services/orders.js'), restore, calls }
}
const admin = (params = {}, body = {}) => ({ user: { role: 'super_admin' }, params, query: {}, body })

test('an order shows each package with its tracking events newest first', async () => {
  const { orders, restore, calls } = load({
    'bg.order.detail.v2.get': DETAIL,
    'bg.logistics.shipment.v2.get': { shipmentInfoDTO: [{ packageSn: 'PK1', carrierName: 'USPS', trackingNumber: '9400', subPackageShipmentInfoList: [] }] },
    'temu.track.trackinginfo.get': { packageSn: 'PK1', trackingInfo: [{ statusText: 'Accepted', logisticsUpdatedAt: '1764000000' }, { statusText: 'Delivered', logisticsUpdatedAt: '1764200000' }] },
    'bg.order.customization.get': [],
    'temu.order.cancel.outofstock.result.get': { applyResultInfoList: [] },
  })
  try {
    const res = await orders.temuFollowUp(admin({ id: 'o1' }))
    assert.deepEqual(res.packages.map((p) => [p.packageSn, p.carrier, p.trackingNumber]), [['PK1', 'USPS', '9400']])
    assert.deepEqual(res.packages[0].events.map((e) => e.status), ['Delivered', 'Accepted'])
    assert.equal(res.packages[0].events[0].time, new Date(1764200000 * 1000).toISOString())
    assert.deepEqual(calls.find(([t]) => t === 'temu.track.trackinginfo.get')[1], { access_token: 'tok', packageSn: 'PK1' })
  } finally { restore() }
})

test("a customised order shows the buyer's customisation", async () => {
  const { orders, restore, calls } = load({
    'bg.order.detail.v2.get': DETAIL,
    'bg.logistics.shipment.v2.get': { shipmentInfoDTO: [] },
    'bg.order.customization.get': [{ orderSn: 'O-1', customizedText: 'Happy birthday Sam', previewList: [{ imageUrl: 'https://t/p.png' }] }],
    'temu.order.cancel.outofstock.result.get': { applyResultInfoList: [] },
  })
  try {
    const res = await orders.temuFollowUp(admin({ id: 'o1' }))
    assert.deepEqual(calls.find(([t]) => t === 'bg.order.customization.get')[1], { access_token: 'tok', orderSnList: ['O-1', 'O-2'] })
    assert.deepEqual(res.customizations, [{ orderSn: 'O-1', item: 'Mug', text: 'Happy birthday Sam', images: ['https://t/p.png'] }])
  } finally { restore() }
})

test("an out-of-stock cancellation shows Temu's result per item", async () => {
  const { orders, restore } = load({
    'bg.order.detail.v2.get': DETAIL,
    'bg.logistics.shipment.v2.get': { shipmentInfoDTO: [] },
    'bg.order.customization.get': [],
    'temu.order.cancel.outofstock.result.get': { applyResultInfoList: [{ orderSn: 'O-2', applyStatus: 2 }] },
  })
  try {
    const res = await orders.temuFollowUp(admin({ id: 'o1' }))
    assert.deepEqual(res.cancellations, [{ orderSn: 'O-2', item: 'Cup', status: 'Temu status 2' }])
  } finally { restore() }
})

test("orders that can ship together are grouped by Temu's combine groups", async () => {
  const { orders, restore, calls } = load({
    'bg.order.combinedshipment.list.get': { combinedShippingGroups: [{ combinedShippingGroup: [{ parentOrderSn: 'PO-1', parentOrderTime: 1764000000, parentOrderStatus: 2 }, { parentOrderSn: 'PO-2', parentOrderTime: 1764000100, parentOrderStatus: 2 }] }] },
    'bg.order.unshipped.package.get': { unshippedPackage: [{ packageSn: 'PK9', carrierName: 'UPS', trackingNumber: '1Z', packageDetail: { shippableOrders: [{ orderSn: 'O-1', parentOrderSn: 'PO-1', quantity: 1 }] } }] },
  })
  try {
    const res = await orders.shipTogether(admin())
    assert.deepEqual(res.groups, [{ orders: [{ parentOrderSn: 'PO-1', ordered: new Date(1764000000 * 1000).toISOString() }, { parentOrderSn: 'PO-2', ordered: new Date(1764000100 * 1000).toISOString() }] }])
    assert.deepEqual(res.unshippedPackages, [{ packageSn: 'PK9', carrier: 'UPS', trackingNumber: '1Z', orders: ['PO-1'] }])
    assert.deepEqual(calls.find(([t]) => t === 'bg.order.unshipped.package.get')[1], { access_token: 'tok', parentOrderSnList: ['PO-1', 'PO-2'], pageNumber: 1, pageSize: 50 })
  } finally { restore() }
})

test('verification details are uploaded for an order, and a sub-admin without Orders gets 403', async () => {
  const { orders, restore, calls } = load({ 'bg.order.detail.v2.get': DETAIL, 'temu.local.order.verification.upload': null })
  try {
    await orders.uploadVerification(admin({ id: 'o1' }, { items: [{ orderSn: 'O-1', serialNumber: 'SN123', imeiNumbers: ['3569', ''] }] }))
    assert.deepEqual(calls.find(([t]) => t === 'temu.local.order.verification.upload')[1], { access_token: 'tok', orderList: [{ orderSn: 'O-1', verificationInfo: [{ serialNumber: 'SN123', imeiNumberList: ['3569'] }] }] })
    await assert.rejects(orders.uploadVerification(admin({ id: 'o1' }, { items: [{ orderSn: 'NOT-MINE', serialNumber: 'x' }] })), (e) => e.status === 400)
    const sub = { user: { role: 'sub_admin', mainRoutes: ['products'], allowedSections: ['temu:goods'] }, allowedShopIds: ['s1'], params: { id: 'o1' }, query: {}, body: {} }
    await assert.rejects(orders.shipTogether(sub), (e) => e.status === 403)
  } finally { restore() }
})
