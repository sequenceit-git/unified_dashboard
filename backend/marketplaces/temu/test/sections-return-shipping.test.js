const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const PDF = Buffer.from('%PDF-1.4 label')
const dataUrl = (type, buf) => `data:${type};base64,${buf.toString('base64')}`

function load(replies, calls = []) {
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        const r = replies[type]
        if (r === undefined) throw new Error(`unexpected ${type}`)
        return typeof r === 'function' ? r(body) : r
      },
    },
  })
  return { returns: freshRequire('marketplaces/temu/sections/after-sales.js'), restore, calls }
}

test('a return shows its return shipment', async () => {
  const { returns, restore, calls } = load({
    'bg.aftersales.aftersales.list.get': { data: [] },
    'temu.aftersales.parentaftersales.detail.get': { parentAfterSalesStatus: 3 },
    'bg.aftersales.parentreturnorder.get': { logisticsInfoList: [{ carrierName: 'USPS', trackingNumber: '9400', returnWarehouseRegion1Name: 'United States' }] },
  })
  try {
    const d = await returns.details.aftersales('tok', {}, 'AS1|PO-1')
    const t = d.tables.find((x) => x.id === 'shipment')
    assert.deepEqual(t.rows, [{ carrier: 'USPS', tracking: '9400', to: 'United States' }])
    assert.deepEqual(calls.find(([x]) => x === 'bg.aftersales.parentreturnorder.get')[1], { access_token: 'tok', parentAfterSalesSn: 'AS1' })
  } finally { restore() }
})

test("the buyer's return address is shown only when asked and only from Temu", async () => {
  const { returns, restore } = load({ 'temu.aftersales.returnaddress.get': { receiptName: 'Ann Lee', mobile: '+1 555 0100', addressLineAll: '1 Main St, Austin, TX 78701' } })
  try {
    const d = await returns.details['return-address']('tok', {}, 'AS1|PO-1')
    assert.deepEqual(d.summary.map((s) => [s.label, s.value]), [['Name', 'Ann Lee'], ['Phone', '+1 555 0100'], ['Address', '1 Main St, Austin, TX 78701']])
  } finally { restore() }
})

test("the seller's return label is uploaded with its carrier and tracking", async () => {
  const { returns, restore, calls } = load({
    'temu.aftersales.returnlabel.prepare.get': { availableReturnWarehouseList: [{ warehouseId: 'W1' }], userSelectedPickUpTimeList: [{ startTimestamp: 1764000000, endTimestamp: 1764010000 }], merchantLatestPickUpTime: 1764100000 },
    'bg.arbok.open.upload.uploadFile': { url: 'https://temu.files/label.pdf' },
    'temu.aftersales.upload.returnlabel': null,
  })
  try {
    const res = await returns.actions['return-label']('tok', {}, 'AS1|PO-1', { carrierId: '7', trackingNumber: ' 1Z99 ', file: { name: 'label.pdf', dataUrl: dataUrl('application/pdf', PDF) } })
    assert.deepEqual(calls.find(([t]) => t === 'temu.aftersales.upload.returnlabel')[1], {
      access_token: 'tok', parentAfterSalesSn: 'AS1', parentOrderSn: 'PO-1',
      returnLabelDTOList: [{ mallWarehouseId: 'W1', carrierId: 7, trackingNumber: '1Z99', returnLabelUrl: 'https://temu.files/label.pdf' }],
      startTimestamp: 1764000000, endTimestamp: 1764010000, latestTimestamp: 1764100000,
    })
    assert.match(res.message, /Return label sent/)
  } finally { restore() }
})

test('a label without carrier, tracking or a PDF/image file is refused before Temu', async () => {
  const { returns, restore, calls } = load({})
  try {
    await assert.rejects(returns.actions['return-label']('tok', {}, 'AS1|PO-1', { carrierId: '7', trackingNumber: '', file: { name: 'l.pdf', dataUrl: dataUrl('application/pdf', PDF) } }), (e) => e.status === 400)
    await assert.rejects(returns.actions['return-label']('tok', {}, 'AS1|PO-1', { carrierId: '7', trackingNumber: '1Z', file: { name: 'l.exe', dataUrl: dataUrl('application/x', Buffer.from('MZ')) } }), (e) => e.status === 400)
    assert.equal(calls.length, 0)
  } finally { restore() }
})

test('open returns offer the label upload and the address; closed ones only details', async () => {
  const { returns, restore } = load({
    'bg.aftersales.parentaftersales.list.get': { data: [{ parentAfterSalesSn: 'AS1', parentOrderSn: 'PO-1', afterSalesStatusGroup: 2 }, { parentAfterSalesSn: 'AS2', parentOrderSn: 'PO-2', afterSalesStatusGroup: 5 }] },
    'bg.aftersales.cancel.list.get': { data: [] },
    'temu.aftersales.carrier.get': { carrierDTOList: [{ carrierId: 7, carrierName: 'UPS' }] },
  })
  try {
    const rows = (await returns('tok', {})).tables.find((t) => t.id === 'returns').rows
    assert.deepEqual(rows.map((r) => r.actions.map((a) => a.id)), [['aftersales', 'return-address', 'return-label'], ['aftersales']])
    const label = rows[0].actions.find((a) => a.id === 'return-label')
    assert.deepEqual(label.input.fields.map((f) => f.name), ['carrierId', 'trackingNumber', 'file'])
    assert.deepEqual(label.input.fields[0].options, [{ value: '7', label: 'UPS' }])
  } finally { restore() }
})
