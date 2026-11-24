/**
 * TikTok Shop "returns-cancellations" section: returns (approve with the page's own button, reject
 * with one of TikTok's reasons for that return, history) and cancellations.
 */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttPost, ttGet, withVersionFallback } = require('./helpers')
const cache = require('../../../services/core/cache')
const { HttpError } = require('../../../utils/httpError')

const CLOSED = /SUCCESS|CLOSED|REJECT|CANCEL|COMPLETE|REFUNDED/i
const REASONS_FOR = 20 // open returns whose reject reasons are looked up per load
const DAY = 24 * 60 * 60
const enc = encodeURIComponent

function searchReturns(token, shop, body) {
  return withVersionFallback(
    () => ttPost(token, shop, '/return_refund/202602/returns/search', {}, body),
    () => ttPost(token, shop, '/return_refund/202309/returns/search', {}, body),
  )
}

function searchCancellations(token, shop, body) {
  return withVersionFallback(
    () => ttPost(token, shop, '/return_refund/202602/cancellations/search', {}, body),
    () => ttPost(token, shop, '/return_refund/202309/cancellations/search', {}, body),
  )
}

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
      tab: 'Returns & cancellations',
      title: 'Returns and refunds',
      columns: [col('id', 'Return'), col('orderId', 'Order'), col('type', 'Type'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Opened', 'date')],
      load: async () => (await searchReturns(token, shop, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).return_orders?.map((row) => {
        const rawStatus = row.return_status || ''
        const actions = [
          { id: 'records', label: 'History', detail: true },
          { id: 'refund-preview', label: 'Refund & eligibility', detail: true },
        ]
        if (!CLOSED.test(rawStatus)) {
          actions.push({
            id: 'return-tracking',
            label: 'Add return tracking',
            input: {
              fields: [
                { name: 'trackingNumber', label: 'Return tracking number' },
                { name: 'carrier', label: 'Shipping provider name' },
              ],
            },
          })
        }
        return {
          id: row.return_id,
          returnId: row.return_id,
          orderId: row.order_id,
          type: words(row.return_type),
          returnType: row.return_type || '',
          reason: row.return_reason_text || words(row.return_reason),
          status: words(rawStatus),
          rawStatus,
          refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
          created: seconds(row.create_time),
          actions,
        }
      }) || [],
    },
    {
      id: 'cancellations',
      tab: 'Returns & cancellations',
      title: 'Cancellations',
      columns: [col('id', 'Cancellation'), col('orderId', 'Order'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
      load: async () => (await searchCancellations(token, shop, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).cancellations?.map((row) => ({
        id: row.cancel_id,
        cancelId: row.cancel_id,
        orderId: row.order_id,
        reason: row.cancel_reason_text || words(row.cancel_reason),
        status: words(row.cancel_status),
        refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
        created: seconds(row.create_time),
      })) || [],
    },
    {
      id: 'aftersales',
      tab: 'Aftersales & RMA',
      title: 'Aftersale requests',
      columns: [col('aftersaleId', 'Request'), col('orderId', 'Order'), col('type', 'Type'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Opened', 'date')],
      load: async () => {
        const res = await ttPost(token, shop, '/return_refund/202603/aftersales/search', {}, { page_size: 50 }).catch(() => ({}))
        const rows = res.aftersale_orders || res.aftersales || res.return_orders || res.orders || []
        return rows.map((row) => {
          const orderId = row.order_id || ''
          const aftersaleId = row.aftersale_id || row.return_id || row.id || ''
          return {
            id: orderId || aftersaleId,
            aftersaleId,
            orderId,
            type: words(row.aftersale_type || row.return_type || row.type),
            status: words(row.aftersale_status || row.return_status || row.status),
            refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
            created: seconds(row.create_time),
            actions: orderId ? [{ id: 'aftersale-eligibility', label: 'Order eligibility', detail: true }] : [],
          }
        })
      },
    },
    {
      id: 'rmas',
      tab: 'Aftersales & RMA',
      title: 'Return Merchandise Authorizations (RMA)',
      columns: [col('id', 'RMA ID'), col('returnId', 'Return'), col('orderId', 'Order'), col('status', 'Status', 'status'), col('tracking', 'Tracking'), col('created', 'Created', 'date')],
      load: async () => {
        const res = await ttPost(token, shop, '/return_refund/202604/rma/search', {}, { page_size: 50 }).catch(() => ({}))
        const rows = res.rmas || res.rma_list || res.return_orders || []
        return rows.map((row) => ({
          id: row.rma_id || row.id || row.return_id,
          returnId: row.return_id || '',
          orderId: row.order_id || '',
          status: words(row.rma_status || row.status),
          tracking: row.tracking_number || row.return_tracking_number || '',
          created: seconds(row.create_time),
        }))
      },
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
      { tab: 'Returns & cancellations', label: 'Returns', value: list[0].rows.length, type: 'number' },
      { tab: 'Returns & cancellations', label: 'Cancellations', value: list[1].rows.length, type: 'number' },
      { tab: 'Aftersales & RMA', label: 'Aftersales', value: list[2].rows.length, type: 'number' },
      { tab: 'Aftersales & RMA', label: 'RMAs', value: list[3].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, tables }`. */
returns.details = {
  /** A return's history: each step, who took it and why, newest first. */
  records: async (token, shop, id) => {
    const { records = [] } = await ttGet(token, shop, `/return_refund/202309/returns/${enc(id)}/records`)
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

  /** Calculated refund breakdown and seller decision / review eligibility for one return. */
  'refund-preview': async (token, shop, id) => {
    const search = await searchReturns(token, shop, { return_ids: [id], page_size: 1 }).catch(() => ({}))
    const ret = search.return_orders?.find((r) => r.return_id === id) || search.return_orders?.[0] || {}
    const calcBody = {
      order_id: ret.order_id || '',
      request_type: ret.return_type || 'REFUND',
      shipment_type: ret.shipment_type || 'PLATFORM',
      handover_method: ret.handover_method || 'DROP_OFF',
      reason_name: ret.return_reason || '',
      order_line_item_ids: (ret.return_line_items || []).map((li) => li.order_line_item_id).filter(Boolean),
      skus: (ret.return_line_items || []).map((li) => ({ sku_id: li.sku_id, quantity: li.quantity || 1 })).filter((s) => s.sku_id),
    }
    const [calc, elig, review] = await Promise.all([
      withVersionFallback(
        () => ttPost(token, shop, '/return_refund/202602/refunds/calculate', {}, calcBody),
        () => ttPost(token, shop, '/return_refund/202309/refunds/calculate', {}, calcBody),
      ).catch(() => null),
      ttGet(token, shop, '/return_refund/202601/decision_eligibility', { return_id: id }).catch(() => null),
      ttGet(token, shop, '/return_refund/202606/review_decision', { return_id: id }).catch(() => null),
    ])

    const amt = calc?.order_refund_amount || calc?.refund_amount || ret.refund_amount || {}
    const calcRows = [
      amt.refund_total != null && { item: 'Total refund', amount: ttMoney(amt.refund_total, amt.currency) },
      amt.refund_subtotal != null && { item: 'Subtotal', amount: ttMoney(amt.refund_subtotal, amt.currency) },
      amt.refund_tax != null && { item: 'Tax', amount: ttMoney(amt.refund_tax, amt.currency) },
      amt.refund_shipping_fee != null && { item: 'Shipping fee', amount: ttMoney(amt.refund_shipping_fee, amt.currency) },
      amt.retail_delivery_fee != null && { item: 'Retail delivery fee', amount: ttMoney(amt.retail_delivery_fee, amt.currency) },
    ].filter(Boolean)

    const eligRows = []
    for (const d of elig?.eligible_decisions || elig?.decisions || []) {
      eligRows.push({
        source: 'Decision eligibility',
        decision: words(d.decision || d.action || d.type || d),
        eligible: d.is_eligible === false ? 'No' : 'Yes',
        reason: d.ineligible_reason || d.reason || '',
      })
    }
    if (elig && !eligRows.length && (elig.can_approve != null || elig.can_reject != null || elig.is_eligible != null)) {
      if (elig.can_approve != null) eligRows.push({ source: 'Decision eligibility', decision: 'Approve', eligible: elig.can_approve ? 'Yes' : 'No', reason: elig.reason || '' })
      if (elig.can_reject != null) eligRows.push({ source: 'Decision eligibility', decision: 'Reject', eligible: elig.can_reject ? 'Yes' : 'No', reason: elig.reason || '' })
    }
    if (review) {
      eligRows.push({
        source: 'Review status',
        decision: words(review.decision || review.review_status || review.status || 'Review'),
        eligible: review.is_eligible == null ? '' : (review.is_eligible ? 'Yes' : 'No'),
        reason: review.reason || review.reason_text || (review.deadline ? `Deadline: ${seconds(review.deadline) || review.deadline}` : ''),
      })
    }

    return {
      title: `Refund & eligibility · ${id}`,
      tables: [
        {
          id: 'refund-calculation',
          title: 'Refund breakdown',
          columns: [col('item', 'Component'), col('amount', 'Amount', 'money')],
          rows: calcRows,
        },
        {
          id: 'decision-eligibility',
          title: 'Decision & review eligibility',
          columns: [col('source', 'Check'), col('decision', 'Option'), col('eligible', 'Allowed'), col('reason', 'Notes')],
          rows: eligRows,
        },
      ],
    }
  },

  /** Order-level aftersale eligibility (which line items / request types TikTok allows). */
  'aftersale-eligibility': async (token, shop, orderId) => {
    const res = await withVersionFallback(
      () => ttGet(token, shop, `/return_refund/202602/orders/${enc(orderId)}/aftersale_eligibility`),
      () => ttGet(token, shop, `/return_refund/202512/orders/${enc(orderId)}/aftersale_eligibility`),
    )
    const entries = res.sku_eligibility || res.aftersale_eligibilities || res.eligibilities || res.items || []
    return {
      title: `Order aftersale eligibility · ${orderId}`,
      tables: [{
        id: 'order-eligibility',
        title: 'Eligible items & types',
        columns: [col('sku', 'SKU / Line'), col('type', 'Request type'), col('eligible', 'Eligible'), col('reason', 'Reason')],
        rows: entries.map((e) => ({
          sku: e.sku_id || e.order_line_item_id || e.line_item_id || 'Order',
          type: (e.request_types || [e.request_type]).filter(Boolean).map(words).join(', '),
          eligible: e.eligible === false || e.is_eligible === false ? 'No' : 'Yes',
          reason: e.ineligible_reason_text || e.ineligible_reason || e.reason || '',
        })),
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

  /** Submits or updates return shipping tracking on an open return. */
  'return-tracking': async (token, shop, id, value) => {
    const tracking = String(value?.trackingNumber || '').trim()
    const carrier = String(value?.carrier || '').trim()
    if (!tracking || !carrier) throw new HttpError(400, { error: 'Enter both return tracking number and shipping provider name.' })
    await ttPost(
      token,
      shop,
      '/return_refund/202405/returns/shipping_documents',
      { return_ids: id },
      { tracking_number: tracking, shipping_provider_name: carrier, document_type: 'TRACKING_INFO' },
    )
    return { message: `Return tracking ${tracking} saved for ${id}.` }
  },
}

module.exports = returns
