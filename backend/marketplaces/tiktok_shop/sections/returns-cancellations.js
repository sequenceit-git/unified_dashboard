/** tiktok_shop "returns" section: its tables (subsections) for the shop section page. */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttPost } = require('./helpers')

async function returns(token, shop) {
  const list = await tables([
    {
      id: 'returns',
      title: 'Returns and refunds',
      columns: [col('id', 'Return'), col('orderId', 'Order'), col('type', 'Type'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Opened', 'date')],
      load: async () => (await ttPost(token, shop, '/return_refund/202309/returns/search', {}, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).return_orders?.map((row) => ({
        id: row.return_id,
        returnId: row.return_id,
        orderId: row.order_id,
        type: words(row.return_type),
        returnType: row.return_type || '',
        reason: row.return_reason_text || words(row.return_reason),
        status: words(row.return_status),
        rawStatus: row.return_status || '',
        refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
        created: seconds(row.create_time),
      })) || [],
    },
    {
      id: 'cancellations',
      title: 'Cancellations',
      columns: [col('id', 'Cancellation'), col('orderId', 'Order'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
      load: async () => (await ttPost(token, shop, '/return_refund/202309/cancellations/search', {}, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).cancellations?.map((row) => ({
        id: row.cancel_id,
        cancelId: row.cancel_id,
        orderId: row.order_id,
        reason: row.cancel_reason_text || words(row.cancel_reason),
        status: words(row.cancel_status),
        refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
        created: seconds(row.create_time),
      })) || [],
    },
  ])
  return {
    summary: [
      { label: 'Returns', value: list[0].rows.length, type: 'number' },
      { label: 'Cancellations', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = returns
