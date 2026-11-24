/**
 * Temu "after-sales" section: returns/refunds (approve with the page's own button; details per
 * request) and cancellation requests.
 */
const temu = require('../service')
const { col, tables, words } = require('../../../services/marketplace/sectionKit')
const { AFTERSALES_GROUP, temuTime, TEMU_AFTERSALES_STATUS, temuAmount, temuFile } = require('./helpers')

// Temu US: the return warehouse region for return carriers.
const US_REGION = 211
const CLOSED = /refunded|rejected|cancelled/i

async function returns(token) {
  const carriers = ((await temu.call('temu.aftersales.carrier.get', { access_token: token, returnWarehouseRegionId1: US_REGION }).catch(() => ({}))).carrierDTOList || [])
    .map((c) => ({ value: String(c.carrierId), label: c.carrierName }))
  const end = Math.floor(Date.now() / 1000)
  const start = end - 90 * 24 * 3600
  const list = await tables([
    {
      id: 'returns',
      title: 'Returns and refunds (last 90 days)',
      note: 'Temu lets apps approve returns (full refund) and cancellations only. Decline or partially refund in Temu Seller Center.',
      columns: [col('id', 'Request'), col('order', 'Order'), col('status', 'Status', 'status'), col('opened', 'Opened', 'date'), col('updated', 'Updated', 'date'), col('respondBy', 'Respond by', 'date')],
      load: async () => (await temu.call('bg.aftersales.parentaftersales.list.get', {
        access_token: token,
        pageNo: 1,
        pageSize: 50,
        createAtStart: start,
        createAtEnd: end,
      })).data?.map((row) => ({
        // "<request>|<order>": the detail call needs both.
        id: `${row.parentAfterSalesSn}|${row.parentOrderSn}`,
        returnId: row.parentAfterSalesSn,
        cancelId: row.parentAfterSalesSn,
        order: row.parentOrderSn,
        orderId: row.parentOrderSn,
        status: AFTERSALES_GROUP[row.afterSalesStatusGroup] || 'Open',
        opened: temuTime(row.createAt),
        updated: temuTime(row.updateAt),
        respondBy: temuTime(row.operateExpireTimeMs),
        actions: [
          { id: 'aftersales', label: 'Details', detail: true },
          ...(CLOSED.test(AFTERSALES_GROUP[row.afterSalesStatusGroup] || '') ? [] : [
            { id: 'return-address', label: "Buyer's address", detail: true },
            { id: 'return-label', label: 'Upload return label', input: { fields: [
              carriers.length ? { name: 'carrierId', label: 'Carrier', options: carriers } : { name: 'carrierId', label: 'Carrier id' },
              { name: 'trackingNumber', label: 'Tracking number' },
              { name: 'file', label: 'Label (PDF, JPEG or PNG)', type: 'file', accept: 'application/pdf,image/jpeg,image/png' },
            ] } },
          ]),
        ],
      })) || [],
    },
    {
      id: 'cancellations',
      title: 'Cancellation requests',
      columns: [col('cancelId', 'Request'), col('orderId', 'Order'), col('status', 'Status', 'status'), col('items', 'Items', 'number'), col('opened', 'Opened', 'date')],
      load: async () => ((await temu.call('bg.aftersales.cancel.list.get', {
        access_token: token,
        pageNo: 1,
        pageSize: 50,
      })).data || []).map((row) => {
        const lines = row.afterSalesInfoList || []
        const status = Number(row.parentAfterSalesStatus)
        return {
          cancelId: row.parentAfterSalesSn,
          orderId: lines[0]?.parentOrderSn || '',
          // 1 = waiting for the seller; everything else is already settled.
          status: status === 1 ? 'Pending' : (TEMU_AFTERSALES_STATUS[status] || 'Closed'),
          items: lines.reduce((sum, line) => sum + Number(line.applyGoodsNumber || 0), 0) || lines.length,
          opened: temuTime(lines[0]?.createAtMillis),
        }
      }),
    },
  ])
  const open = list[0].rows.filter((row) => !/refunded|rejected|cancelled/i.test(row.status)).length
  return {
    summary: [
      { label: 'Open requests', value: open, type: 'number' },
      { label: 'Requests', value: list[0].rows.length, type: 'number' },
      { label: 'Pending cancellations', value: list[1].rows.filter((row) => row.status === 'Pending').length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, summary, tables }`. */
returns.details = {
  /** id = "<parentAfterSalesSn>|<parentOrderSn>": each line of the request and its record. */
  aftersales: async (token, shop, id) => {
    const [sn, orderSn] = String(id).split('|')
    const [lines, detail, ship] = await Promise.all([
      temu.call('bg.aftersales.aftersales.list.get', { access_token: token, pageNo: 1, pageSize: 50, parentAfterSalesSnList: [sn] }),
      temu.call('temu.aftersales.parentaftersales.detail.get', { access_token: token, parentAfterSalesSn: sn, ...(orderSn ? { parentOrderSn: orderSn } : {}) }),
      temu.call('bg.aftersales.parentreturnorder.get', { access_token: token, parentAfterSalesSn: sn }).catch(() => ({ logisticsInfoList: [] })),
    ])
    const byLine = new Map((detail.afterSalesList || []).map((l) => [String(l.afterSalesSn), l]))
    const refund = detail.refundSummary || {}
    const when = (ms) => (ms ? new Date(Number(ms)).toISOString() : '')
    return {
      title: `After-sales ${sn}`,
      summary: [
        { label: 'Refund to buyer', value: temuAmount(refund.buyerTotalRefund), type: 'money' },
        { label: 'Your discount refunded', value: temuAmount(refund.discountFromSellerRefund), type: 'money' },
        { label: 'Status', value: TEMU_AFTERSALES_STATUS[detail.parentAfterSalesStatus] || String(detail.parentAfterSalesStatus ?? '—'), type: 'text' },
      ],
      tables: [
        {
          id: 'lines',
          title: 'Lines',
          columns: [col('line', 'Line'), col('goods', 'Goods / SKU'), col('qty', 'Qty', 'number'), col('status', 'Status', 'status'), col('reason', 'Reason'), col('refund', 'Refund asked', 'money')],
          rows: (lines.data || []).map((l) => {
            const more = byLine.get(String(l.afterSalesSn)) || {}
            return {
              line: l.afterSalesSn,
              goods: `${l.goodsId} / ${l.skuId}`,
              qty: l.applyAfterSalesGoodsNumber ?? more.applyAfterSalesGoodsNumber ?? 0,
              status: TEMU_AFTERSALES_STATUS[l.afterSalesStatus] || words(String(l.afterSalesStatus ?? '')),
              reason: [more.afterSalesReasonDesc, more.buyerComment].filter(Boolean).join(': '),
              refund: temuAmount(more.applyRefundAmount),
            }
          }),
        },
        {
          id: 'shipment',
          title: 'Return shipment',
          columns: [col('carrier', 'Carrier'), col('tracking', 'Tracking'), col('to', 'Returns to')],
          rows: (ship.logisticsInfoList || []).map((l) => ({ carrier: l.carrierName || '', tracking: l.trackingNumber || '', to: l.returnWarehouseRegion1Name || '' })),
        },
        {
          id: 'history',
          title: 'Record',
          columns: [col('what', 'What'), col('value', 'Value')],
          rows: [
            { what: 'Order', value: detail.parentOrderSn || orderSn || '' },
            { what: 'Status', value: TEMU_AFTERSALES_STATUS[detail.parentAfterSalesStatus] || String(detail.parentAfterSalesStatus ?? '') },
            { what: 'Opened', value: when(detail.createAtMillis) },
            { what: 'Last updated', value: when(detail.lastUpdateAtMillis) },
          ].filter((r) => r.value),
        },
      ],
    }
  },
}

/** The buyer's pickup address for a return, shown only when asked (never stored or cached). */
returns.details['return-address'] = async (token, shop, id) => {
  const [sn] = String(id).split('|')
  const a = await temu.call('temu.aftersales.returnaddress.get', { access_token: token, parentAfterSalesSn: sn })
  const address = a.addressLineAll || [a.addressLine1, a.addressLine2, a.addressLine3, a.regionName3, a.regionName2, a.postCode, a.regionName1].filter(Boolean).join(', ')
  return {
    title: `Buyer's return address (${sn})`,
    summary: [
      { label: 'Name', value: a.receiptName || '—', type: 'text' },
      { label: 'Phone', value: a.mobile || '—', type: 'text' },
      { label: 'Address', value: address || '—', type: 'text' },
    ],
    tables: [],
  }
}

/** Row actions. */
returns.actions = {
  /**
   * The seller's own return label: the file goes to Temu's file upload, then the label is sent with
   * the carrier, tracking, the first return warehouse Temu offers and the buyer's chosen pickup time.
   */
  'return-label': async (token, shop, id, value = {}) => {
    const [sn, orderSn] = String(id).split('|')
    const trackingNumber = String(value.trackingNumber || '').trim()
    const carrierId = Number(value.carrierId)
    if (!trackingNumber || !Number.isInteger(carrierId)) throw Object.assign(new Error('Choose the carrier and enter the tracking number.'), { status: 400, body: { error: 'Choose the carrier and enter the tracking number.' } })
    const file = temuFile(value.file, 10)
    const prep = await temu.call('temu.aftersales.returnlabel.prepare.get', { access_token: token, parentAfterSalesSn: sn, parentOrderSn: orderSn })
    const warehouse = (prep.availableReturnWarehouseList || [])[0]
    if (!warehouse) throw Object.assign(new Error('Temu offers no return warehouse for this request.'), { status: 400, body: { error: 'Temu offers no return warehouse for this request.' } })
    const { url } = await temu.call('bg.arbok.open.upload.uploadFile', { access_token: token, base64File: file.dataUrl })
    const time = (prep.userSelectedPickUpTimeList || [])[0]
    await temu.call('temu.aftersales.upload.returnlabel', {
      access_token: token,
      parentAfterSalesSn: sn,
      parentOrderSn: orderSn,
      returnLabelDTOList: [{ mallWarehouseId: warehouse.warehouseId, carrierId, trackingNumber, returnLabelUrl: url }],
      ...(time ? { startTimestamp: time.startTimestamp, endTimestamp: time.endTimestamp } : {}),
      ...(prep.merchantLatestPickUpTime ? { latestTimestamp: prep.merchantLatestPickUpTime } : {}),
    })
    return { message: `Return label sent to Temu for ${sn} (${trackingNumber}).` }
  },
}

module.exports = returns
