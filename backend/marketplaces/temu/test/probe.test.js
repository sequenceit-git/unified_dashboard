const test = require('node:test')
const assert = require('node:assert/strict')
const { probeRequest } = require('../scripts/probeRules')

test('the probe runs only read-only Temu calls, with JSON parameters', () => {
  assert.deepEqual(probeRequest(['bg.promotion.activity.query', '{"pageNumber":1,"pageSize":20}']), { method: 'bg.promotion.activity.query', params: { pageNumber: 1, pageSize: 20 } })
  assert.deepEqual(probeRequest(['temu.local.sku.list.retrieve']), { method: 'temu.local.sku.list.retrieve', params: {} })
  for (const write of ['bg.local.goods.add', 'bg.logistics.shipment.create', 'temu.local.goods.delete', 'bg.promotion.activity.goods.enroll', 'temu.searchrec.ad.modify', 'bg.local.goods.stock.edit']) {
    assert.throws(() => probeRequest([write]), /read-only/, write)
  }
  assert.throws(() => probeRequest([]), /Usage/)
  assert.throws(() => probeRequest(['bg.order.list.v2.get', '{not json']), /JSON/)
  assert.throws(() => probeRequest(['bg.order.list.v2.get', '{"access_token":"x"}']), /access_token/)
})
