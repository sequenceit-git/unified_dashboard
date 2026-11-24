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
