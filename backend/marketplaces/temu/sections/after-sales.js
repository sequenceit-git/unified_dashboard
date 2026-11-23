/** Temu "returns" section: its tables (subsections) for the shop section page. */
const temu = require('../service')
const { col, tables } = require('../../../services/marketplace/sectionKit')
const { AFTERSALES_GROUP, temuTime, TEMU_AFTERSALES_STATUS } = require('./helpers')

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
        id: row.parentAfterSalesSn,
        returnId: row.parentAfterSalesSn,
        cancelId: row.parentAfterSalesSn,
        order: row.parentOrderSn,
        orderId: row.parentOrderSn,
        status: AFTERSALES_GROUP[row.afterSalesStatusGroup] || 'Open',
        opened: temuTime(row.createAt),
        updated: temuTime(row.updateAt),
        respondBy: temuTime(row.operateExpireTimeMs),
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

module.exports = returns
