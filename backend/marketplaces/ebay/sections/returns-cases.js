/** ebay "returns" section: its tables (subsections) for the shop section page. */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')

async function returns(token) {
  const list = await tables([
    {
      id: 'returns',
      title: 'Returns',
      columns: [col('returnId', 'Return'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date'), col('url', '', 'link')],
      load: async () => (await ebayGet(token, '/post-order/v2/return/search?limit=50', { iaf: true })).members?.map((row) => ({
        returnId: row.returnId,
        orderId: row.orderId,
        buyer: row.buyerLoginName,
        reason: [words(row.creationInfo?.reason), row.creationInfo?.comments?.content].filter(Boolean).join(': '),
        status: words(row.status || row.state),
        refund: money(row.sellerTotalRefund?.estimatedRefundAmount),
        respondBy: row.sellerResponseDue?.respondByDate?.value || null,
        created: row.creationInfo?.creationDate?.value || null,
        url: `https://www.ebay.com/rt/ReturnDetails?returnId=${row.returnId}`,
      })) || [],
    },
    {
      id: 'cancellations',
      title: 'Cancellations',
      columns: [col('cancelId', 'Cancellation'), col('orderId', 'Order'), col('item', 'Item'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
      load: async () => (await ebayGet(token, '/post-order/v2/cancellation/search?limit=50', { iaf: true })).cancellations?.map((row) => ({
        cancelId: row.cancelId,
        orderId: row.legacyOrderId || row.orderId || '',
        item: row.lineItems?.map((line) => line.itemTitle).join(', ') || '',
        reason: words(row.cancelReason),
        status: words(row.cancelStatus),
        refund: money(row.requestRefundAmount),
        created: row.cancelRequestDate?.value || null,
      })) || [],
    },
    {
      id: 'cases',
      title: 'Cases',
      columns: [col('caseId', 'Case'), col('itemId', 'Item'), col('buyer', 'Buyer'), col('status', 'Status', 'status'), col('claim', 'Claim', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date')],
      load: async () => (await ebayGet(token, '/post-order/v2/casemanagement/search?limit=50', { iaf: true })).members?.map((row) => ({
        caseId: String(row.caseId),
        itemId: String(row.itemId),
        buyer: row.buyer,
        status: words(row.caseStatusEnum),
        claim: money(row.claimAmount),
        respondBy: row.respondByDate?.value || null,
        created: row.creationDate?.value || null,
      })) || [],
    },
  ])
  const open = (rows, closed) => rows.filter((row) => !closed.test(row.status)).length
  return {
    summary: [
      { label: 'Open returns', value: open(list[0].rows, /closed/i), type: 'number' },
      { label: 'Open cancellations', value: open(list[1].rows, /closed/i), type: 'number' },
      { label: 'Open cases', value: open(list[2].rows, /closed/i), type: 'number' },
    ],
    tables: list,
  }
}

module.exports = returns
