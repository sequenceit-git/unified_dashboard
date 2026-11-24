/**
 * Temu "after-sales" section: returns/refunds (approve with the page's own button; details per
 * request) and cancellation requests.
 */
const temu = require('../service')
const { col, tables, words } = require('../../../services/marketplace/sectionKit')
const { AFTERSALES_GROUP, temuTime, TEMU_AFTERSALES_STATUS, temuAmount } = require('./helpers')

async function returns(token) {
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
        actions: [{ id: 'aftersales', label: 'Details', detail: true }],
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
    const [lines, detail] = await Promise.all([
      temu.call('bg.aftersales.aftersales.list.get', { access_token: token, pageNo: 1, pageSize: 50, parentAfterSalesSnList: [sn] }),
      temu.call('temu.aftersales.parentaftersales.detail.get', { access_token: token, parentAfterSalesSn: sn, ...(orderSn ? { parentOrderSn: orderSn } : {}) }),
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

module.exports = returns
