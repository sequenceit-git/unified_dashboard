/**
 * TikTok Shop "returns-cancellations" section: returns (approve with the page's own button, reject
 * with one of TikTok's reasons for that return, history) and cancellations.
 */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttPost, ttGet } = require('./helpers')
const cache = require('../../../services/core/cache')
const { HttpError } = require('../../../utils/httpError')

const CLOSED = /SUCCESS|CLOSED|REJECT|CANCEL|COMPLETE|REFUNDED/i
const REASONS_FOR = 20 // open returns whose reject reasons are looked up per load
const DAY = 24 * 60 * 60

/** TikTok's reject reasons for one return (they differ per return), cached a day. */
async function rejectReasons(token, shop, returnId) {
  const key = `shop:${shop?._id}:tiktok-reject-reasons:${returnId}`
  const cached = await cache.get(key)
  if (cached) return cached
  const { reasons = [] } = await ttGet(token, shop, '/return_refund/202309/reject_reasons', { return_or_cancel_id: returnId })
  const options = reasons.map((r) => ({ value: r.name, label: r.text || r.name }))
  await cache.set(key, options, DAY)
  return options
}

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
        actions: [{ id: 'records', label: 'History', detail: true }],
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
  // Open returns get "Reject" with TikTok's own reasons for that return.
  const open = list[0].rows.filter((row) => !CLOSED.test(row.rawStatus)).slice(0, REASONS_FOR)
  await Promise.all(open.map(async (row) => {
    const options = await rejectReasons(token, shop, row.returnId).catch(() => [])
    if (options.length) row.actions.push({ id: 'reject', label: 'Reject', danger: true, input: { label: 'Reason TikTok will show the buyer', options } })
  }))
  return {
    summary: [
      { label: 'Returns', value: list[0].rows.length, type: 'number' },
      { label: 'Cancellations', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, tables }`. */
returns.details = {
  /** A return's history: each step, who took it and why, newest first. */
  records: async (token, shop, id) => {
    const { records = [] } = await ttGet(token, shop, `/return_refund/202309/returns/${encodeURIComponent(id)}/records`)
    return {
      title: `Return ${id}`,
      tables: [{
        id: 'records',
        title: 'History',
        columns: [col('time', 'When', 'date'), col('who', 'Who'), col('what', 'What happened'), col('note', 'Note')],
        rows: records
          .map((r) => ({ time: seconds(r.create_time), who: words(r.role), what: [r.description || words(r.event), r.reason_text && `(${r.reason_text})`].filter(Boolean).join(' '), note: r.note || '' }))
          .sort((a, b) => String(b.time).localeCompare(String(a.time))),
      }],
    }
  },
}

/** Row actions: `actions[action](token, shop, id, value) → { message }`. */
returns.actions = {
  /** Rejects a return with the reason code the seller picked from TikTok's list. */
  reject: async (token, shop, id, reason) => {
    if (!reason) throw new HttpError(400, { error: 'Pick the reason TikTok will show the buyer.' })
    const tiktok = require('../service')
    await tiktok.decideReturn(token, id, { decision: 'REJECT', rejectReason: String(reason), shop })
    return { message: `Return ${id} rejected.` }
  },
}

module.exports = returns
