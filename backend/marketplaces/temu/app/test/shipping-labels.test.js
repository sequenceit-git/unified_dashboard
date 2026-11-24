const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../../test/helpers/stub')

const ORDER = { _id: 'o1', shopId: 's1', externalOrderId: 'PO-1', marketplace: 'temu' }
const DETAIL = { orderList: [{ orderSn: 'O-1', goodsId: 77, skuId: 1, quantity: 2 }] }
const WAREHOUSES = { warehouseList: [{ warehouseId: 'W2', defaultWarehouse: false, enableBuyShippingLabel: true }, { warehouseId: 'W1', defaultWarehouse: true, enableBuyShippingLabel: true }] }
const PKG = { weight: '1.25', length: '10', width: '8', height: '4' }

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
  const labels = freshRequire('marketplaces/temu/app/services/labels.js')
  labels.wait = async () => {}
  return { labels, restore, calls }
}
const admin = (params = {}, body = {}, query = {}) => ({ user: { role: 'super_admin' }, params, body, query })

test('services are listed with their price for the package', async () => {
  const { labels, restore, calls } = load({
    'bg.order.detail.v2.get': DETAIL,
    'bg.logistics.warehouse.list.get': WAREHOUSES,
    'bg.logistics.shippingservices.get': {
      onlineChannelDtoList: [{ channelId: 5, shipCompanyId: 9, shippingCompanyName: 'USPS', shipLogisticsType: 'Ground Advantage', estimatedAmount: '6.40', estimatedCurrencyCode: 'USD', estimatedText: '2-5 days', infoNeeded: [] }],
      unavailableChannelDtoList: [{ shippingCompanyName: 'UPS', unavailableReason: 'Too heavy for this service' }],
    },
  })
  try {
    const res = await labels.services(admin({ id: 'o1' }, {}, PKG))
    assert.deepEqual(calls.find(([t]) => t === 'bg.logistics.shippingservices.get')[1], {
      access_token: 'tok', warehouseId: 'W1', orderSnList: ['O-1'], weight: '1.3', weightUnit: 'lb', length: '10', width: '8', height: '4', dimensionUnit: 'in',
    })
    assert.deepEqual(res.services, [{ channelId: 5, shipCompanyId: 9, carrier: 'USPS', service: 'Ground Advantage', price: { value: 6.4, currency: 'USD' }, estimate: '2-5 days' }])
    assert.deepEqual(res.unavailable, [{ carrier: 'UPS', reason: 'Too heavy for this service' }])
    await assert.rejects(labels.services(admin({ id: 'o1' }, {}, { ...PKG, weight: '0' })), (e) => e.status === 400)
  } finally { restore() }
})

test('a package with no service says so', async () => {
  const { labels, restore } = load({ 'bg.order.detail.v2.get': DETAIL, 'bg.logistics.warehouse.list.get': WAREHOUSES, 'bg.logistics.shippingservices.get': { onlineChannelDtoList: [], unavailableChannelDtoList: [] } })
  try {
    const res = await labels.services(admin({ id: 'o1' }, {}, PKG))
    assert.deepEqual(res.services, [])
    assert.match(res.message, /Temu has no shipping service for this package/)
  } finally { restore() }
})

test('buying waits for Temu\'s result and never says bought before it confirms', async () => {
  let polls = 0
  const result = (status) => () => { polls += 1; return { packageInfoResultList: [{ packageSn: 'PK1', shippingLabelStatus: polls < 3 ? 0 : status, trackingNumber: polls < 3 ? '' : '9400', shippingCompanyName: 'USPS', failReasonText: 'Address can not be verified' }] } }
  const base = { 'bg.order.detail.v2.get': DETAIL, 'bg.logistics.warehouse.list.get': WAREHOUSES, 'bg.logistics.shipment.create': { packageSnList: ['PK1'] } }
  const choice = { channelId: 5, shipCompanyId: 9, service: 'Ground Advantage', ...PKG }
  {
    const { labels, restore, calls } = load({ ...base, 'bg.logistics.shipment.result.get': result(1) })
    try {
      const res = await labels.buy(admin({ id: 'o1' }, choice))
      const create = calls.find(([t]) => t === 'bg.logistics.shipment.create')[1]
      assert.deepEqual(create, { access_token: 'tok', sendType: 0, shipLater: false, sendRequestList: [{ warehouseId: 'W1', channelId: 5, shipCompanyId: 9, shipLogisticsType: 'Ground Advantage', orderSendInfoList: [{ orderSn: 'O-1', parentOrderSn: 'PO-1', goodsId: 77, skuId: 1, quantity: 2 }], weight: '1.3', weightUnit: 'lb', length: '10', width: '8', height: '4', dimensionUnit: 'in' }] })
      assert.deepEqual([res.status, res.packageSn, res.trackingNumber], ['bought', 'PK1', '9400'])
    } finally { restore() }
  }
  polls = 0
  {
    const { labels, restore } = load({ ...base, 'bg.logistics.shipment.result.get': result(2) })
    try {
      const res = await labels.buy(admin({ id: 'o1' }, choice))
      assert.deepEqual([res.status, res.reason], ['failed', 'Address can not be verified'])
    } finally { restore() }
  }
  {
    const { labels, restore } = load({ ...base, 'bg.logistics.shipment.result.get': { packageInfoResultList: [{ packageSn: 'PK1', shippingLabelStatus: 0 }] } })
    try {
      const res = await labels.buy(admin({ id: 'o1' }, choice))
      assert.equal(res.status, 'pending')
      assert.match(res.message, /still buying the label/)
    } finally { restore() }
  }
})

test("the label is fetched from Temu's signed link and handed over as a file", async () => {
  const { labels, restore, calls } = load({ 'bg.order.detail.v2.get': DETAIL, 'bg.logistics.shipment.document.get': { shippingLabelUrlList: [{ packageSn: 'PK1', url: 'https://label.temu.test/pk1' }] } })
  const realFetch = global.fetch
  const seen = []
  global.fetch = async (url, opts) => { seen.push([url, opts.headers]); return new Response(Buffer.from('%PDF-1.4'), { status: 200, headers: { 'content-type': 'application/pdf' } }) }
  try {
    const file = await labels.labelFile(admin({ id: 'o1' }, {}, { packageSn: 'PK1' }))
    assert.deepEqual(calls.find(([t]) => t === 'bg.logistics.shipment.document.get')[1], { access_token: 'tok', packageSnList: ['PK1'] })
    assert.equal(seen[0][0], 'https://label.temu.test/pk1')
    const h = seen[0][1]
    assert.equal(h['toa-access-token'], 'tok')
    assert.match(h['toa-random'], /^\d{32}$/)
    assert.match(h['toa-sign'], /^[0-9A-F]{32}$/)
    assert.equal(file.contentType, 'application/pdf')
    assert.equal(file.buffer.toString(), '%PDF-1.4')
    await assert.rejects(labels.labelFile(admin({ id: 'o1' }, {}, { packageSn: '../x' })), (e) => e.status === 400)
  } finally { global.fetch = realFetch; restore() }
})

test('a failed label can be bought again and a package can switch to your own carrier', async () => {
  const { labels, restore, calls } = load({ 'bg.order.detail.v2.get': DETAIL, 'bg.logistics.warehouse.list.get': WAREHOUSES, 'bg.logistics.shipment.update': true, 'bg.logistics.shipment.shippingtype.update': true, 'bg.logistics.shipment.result.get': { packageInfoResultList: [{ packageSn: 'PK1', shippingLabelStatus: 1, trackingNumber: '9401' }] } })
  try {
    assert.equal((await labels.retry(admin({ id: 'o1' }, { packageSn: 'PK1', channelId: 6, shipCompanyId: 9, service: 'Priority', ...PKG }))).status, 'bought')
    assert.deepEqual(calls.find(([t]) => t === 'bg.logistics.shipment.update')[1].retrySendPackageRequestList[0], { packageSn: 'PK1', warehouseId: 'W1', channelId: 6, shipCompanyId: 9, shipLogisticsType: 'Priority', weight: '1.3', weightUnit: 'lb', length: '10', width: '8', height: '4', dimensionUnit: 'in' })
    await labels.ownCarrier(admin({ id: 'o1' }, { packageSn: 'PK1', shipCompanyId: 3, trackingNumber: ' 1Z99 ' }))
    assert.deepEqual(calls.find(([t]) => t === 'bg.logistics.shipment.shippingtype.update')[1], { access_token: 'tok', editPackageRequestList: [{ packageSn: 'PK1', shipCompanyId: 3, trackingNumber: '1Z99', selfShippingWarehouseId: 'W1' }] })
  } finally { restore() }
})

test('a pickup can be booked, checked and cancelled', async () => {
  const { labels, restore, calls } = load({
    'bg.order.detail.v2.get': DETAIL,
    'temu.logistics.shipment.pickup.reservation.create': { pickupReservationList: [{ packageSnList: ['PK1'] }] },
    'temu.logistics.shipment.pickup.reservation.result.get': { reservationResultList: [{ reservationSn: 'R1', packageSnList: ['PK1'], reservationStatus: 1 }] },
    'temu.logistics.shipment.pickup.reservation.cancel': null,
  })
  try {
    await labels.pickup(admin({ id: 'o1' }, { packageSn: 'PK1', start: '2026-11-25T14:00:00Z', end: '2026-11-25T18:00:00Z' }))
    assert.deepEqual(calls.find(([t]) => t === 'temu.logistics.shipment.pickup.reservation.create')[1], { access_token: 'tok', packageSnList: ['PK1'], pickupStartTime: Date.parse('2026-11-25T14:00:00Z') / 1000, pickupEndTime: Date.parse('2026-11-25T18:00:00Z') / 1000 })
    const st = await labels.pickupStatus(admin({ id: 'o1' }, {}, { packageSn: 'PK1' }))
    assert.deepEqual(st.reservations, [{ reservationSn: 'R1', packages: ['PK1'], status: 'Temu status 1' }])
    await labels.cancelPickup(admin({ id: 'o1' }, { reservationSn: 'R1' }))
    assert.deepEqual(calls.find(([t]) => t === 'temu.logistics.shipment.pickup.reservation.cancel')[1], { access_token: 'tok', reservationSn: 'R1' })
    await assert.rejects(labels.pickup(admin({ id: 'o1' }, { packageSn: 'PK1', start: '2026-11-25T18:00:00Z', end: '2026-11-25T14:00:00Z' })), (e) => e.status === 400)
  } finally { restore() }
})

test('the Shipping page lists bought labels of the last 30 days and Temu US carriers', async () => {
  const calls = []
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        if (type === 'temu.logistics.label.list.get') return { totalItemNum: 1, shippingLabelInfoList: [{ packageSn: 'PK1', shippingLabelStatus: 1, labelPrintStatus: 0, createTime: 1764000000, trackingInfoList: [{ trackingNumber: '9400', shippingCompanyName: 'USPS' }], orderInfoList: [{ parentOrderSn: 'PO-1' }] }] }
        if (type === 'temu.logistics.shiplogisticstype.get') return { shipLogisticsTypeInfoDTOList: [{ shipCompanyId: 9, shippingCompanyName: 'USPS', shipLogisticsType: 'Ground Advantage' }] }
        return { pageItems: [], warehouseList: [], templateList: [] }
      },
    },
  })
  try {
    const shipping = freshRequire('marketplaces/temu/sections/shipping.js')
    const { tables } = await shipping('tok', {}, { now: new Date('2026-11-24T00:00:00Z') })
    const labels = tables.find((t) => t.id === 'labels')
    assert.deepEqual(labels.rows.map((r) => [r.packageSn, r.carrier, r.tracking, r.orders, r.status]), [['PK1', 'USPS', '9400', 'PO-1', 'Bought']])
    const q = calls.find(([t]) => t === 'temu.logistics.label.list.get')[1]
    assert.equal(q.createAtEnd - q.createAtStart, 30 * 86400)
    assert.deepEqual(tables.find((t) => t.id === 'carriers').rows.map((r) => [r.carrier, r.service]), [['USPS', 'Ground Advantage']])
    assert.equal(calls.find(([t]) => t === 'temu.logistics.shiplogisticstype.get')[1].regionId, 211)
  } finally { restore() }
})
