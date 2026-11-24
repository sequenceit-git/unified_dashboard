const test = require('node:test')
const assert = require('node:assert/strict')

test("Temu's latest ship time becomes the order's ship-by date", async () => {
  const orders = require('../orders')
  const svc = { ...orders, fillOrderDetails: async () => {}, call: async () => ({ pageItems: [
    { parentOrderMap: { parentOrderSn: 'PO-1', parentOrderStatus: 2, parentOrderTime: 1764000000, expectShipLatestTime: 1764259200 }, orderList: [] },
    { parentOrderMap: { parentOrderSn: 'PO-2', parentOrderStatus: 4, parentOrderTime: 1764000000, trackingNumber: '1Z' }, orderList: [] },
  ] }) }
  const { orders: out } = await svc.getOrders('tok', { limit: 50 })
  assert.equal(out[0].shipping.shipBy.toISOString(), new Date(1764259200 * 1000).toISOString())
  assert.equal(out[1].shipping.shipBy, undefined)
  assert.equal(out[1].shipping.trackingNumber, '1Z')
})

test('the sync also asks Temu for orders still to ship, however old', async () => {
  const orders = require('../orders')
  const asked = []
  const svc = { ...orders, fillOrderDetails: async () => {}, call: async (method, params) => {
    asked.push(params.parentOrderStatus)
    if (params.parentOrderStatus === 2) return { pageItems: [{ parentOrderMap: { parentOrderSn: 'OLD-1', parentOrderStatus: 2, parentOrderTime: 1700000000, expectShipLatestTime: 1700300000 }, orderList: [] }] }
    return { pageItems: [{ parentOrderMap: { parentOrderSn: 'NEW-1', parentOrderStatus: 4, parentOrderTime: 1764000000 }, orderList: [] }] }
  } }
  const { orders: out } = await svc.getOrders('tok', { limit: 50 })
  assert.ok(asked.includes(2))
  assert.deepEqual(out.map((o) => o.externalOrderId).sort(), ['NEW-1', 'OLD-1'])
})
