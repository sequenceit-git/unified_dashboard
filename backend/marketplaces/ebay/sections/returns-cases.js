/**
 * eBay "returns-cases" section, as tabs: returns and cancellations, item-not-received inquiries,
 * Money Back Guarantee cases, and payment disputes. Rows carry the one-click actions eBay allows
 * in their state (sections/returnsActions.js).
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet, ebayApiz, scopeAware } = require('./helpers')
const { CARRIERS, EVIDENCE_TYPES, ADDRESS_FIELDS } = require('./returnsActions')

const CLOSED = /closed|refunded|cancel|resolved|complete/i
// Any refund already started or issued (REFUND_INITIATED, …_PENDING_CONFIRMATION, LESS_THAN_A_FULL_REFUND_ISSUED).
const REFUND_STARTED = /refund/i
// Buyer has shipped the item back, or it arrived: the seller can mark it received.
const AWAITING_RECEIPT = /ITEM_SHIPPED|RETURN_SHIPPED|ITEM_DELIVERED|BUYER_SHIPPED/i
const OPEN_DISPUTE = /OPEN|ACTION_NEEDED|WAITING_FOR_SELLER/i

function returnActions(row) {
  const state = `${row.state || ''} ${row.status || ''}`
  if (CLOSED.test(state) || REFUND_STARTED.test(state)) return []
  return [
    ...(AWAITING_RECEIPT.test(state) ? [{ id: 'mark-received', label: 'Mark received', confirm: `Mark return ${row.returnId} as received?` }] : []),
    { id: 'refund', label: 'Refund', confirm: `Refund return ${row.returnId} for eBay's estimated amount?` },
  ]
}

async function returnsCases(token) {
  const list = await tables([
    {
      id: 'returns',
      tab: 'Returns',
      title: 'Returns',
      columns: [col('returnId', 'Return'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date'), col('url', '', 'link')],
      load: async () => (await ebayGet(token, '/post-order/v2/return/search?limit=50', { iaf: true })).members?.map((row) => ({
        id: String(row.returnId),
        returnId: row.returnId,
        orderId: row.orderId,
        buyer: row.buyerLoginName,
        reason: [words(row.creationInfo?.reason), row.creationInfo?.comments?.content].filter(Boolean).join(': '),
        status: words(row.status || row.state),
        rawStatus: row.status || row.state,
        refund: money(row.sellerTotalRefund?.estimatedRefundAmount),
        respondBy: row.sellerResponseDue?.respondByDate?.value || null,
        created: row.creationInfo?.creationDate?.value || null,
        url: `https://www.ebay.com/rt/ReturnDetails?returnId=${row.returnId}`,
        actions: returnActions(row),
      })) || [],
    },
    {
      id: 'cancellations',
      tab: 'Returns',
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
      id: 'inquiries',
      tab: 'Inquiries',
      title: 'Item not received inquiries',
      note: 'Answer these before the buyer can escalate them to a case: send tracking, or refund.',
      columns: [col('inquiryId', 'Inquiry'), col('itemId', 'Item'), col('buyer', 'Buyer'), col('status', 'Status', 'status'), col('claim', 'Claim', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date')],
      load: async () => (await ebayGet(token, '/post-order/v2/inquiry/search?inquiry_status=OPEN&limit=50', { iaf: true })).members?.map((row) => ({
        id: String(row.inquiryId),
        inquiryId: String(row.inquiryId),
        itemId: String(row.itemId ?? ''),
        buyer: row.buyer || '',
        status: words(row.inquiryStatusEnum),
        claim: money(row.claimAmount),
        respondBy: row.respondByDate?.value || null,
        created: row.creationDate?.value || null,
        actions: CLOSED.test(row.inquiryStatusEnum || '') ? [] : [
          { id: 'inquiry-refund', label: 'Refund', confirm: `Refund the buyer for inquiry ${row.inquiryId}?` },
          { id: 'inquiry-tracking', label: 'Add tracking', input: { fields: [{ name: 'trackingNumber', label: 'Tracking number' }, { name: 'carrier', label: 'Carrier', options: CARRIERS.map((c) => ({ value: c, label: c })) }] } },
        ],
      })) || [],
    },
    {
      id: 'cases',
      tab: 'Cases',
      title: 'Cases',
      columns: [col('caseId', 'Case'), col('itemId', 'Item'), col('buyer', 'Buyer'), col('status', 'Status', 'status'), col('claim', 'Claim', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date')],
      load: async () => (await ebayGet(token, '/post-order/v2/casemanagement/search?case_status_filter=OPEN&limit=50', { iaf: true })).members?.map((row) => ({
        caseId: String(row.caseId),
        itemId: String(row.itemId),
        buyer: row.buyer,
        status: words(row.caseStatusEnum),
        claim: money(row.claimAmount),
        respondBy: row.respondByDate?.value || null,
        created: row.creationDate?.value || null,
      })) || [],
    },
    {
      id: 'disputes',
      tab: 'Payment disputes',
      title: 'Payment disputes',
      note: 'Chargebacks filed with the buyer\'s bank or card company. Accepting refunds the buyer; contesting with evidence is done on eBay.',
      columns: [col('id', 'Dispute'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('amount', 'Amount', 'money'), col('respondBy', 'Respond by', 'date'), col('opened', 'Opened', 'date')],
      load: scopeAware(async () => (await ebayGet(token, `${ebayApiz()}/sell/fulfillment/v1/payment_dispute_summary?limit=50`)).paymentDisputeSummaries?.map((row) => ({
        id: String(row.paymentDisputeId),
        orderId: row.orderId || '',
        buyer: row.buyerUsername || '',
        reason: words(row.reason),
        status: words(row.paymentDisputeStatus),
        amount: money(row.amount),
        respondBy: row.respondByDate || null,
        opened: row.openDate || null,
        actions: [
          { id: 'dispute', label: 'Details', detail: true },
          ...(OPEN_DISPUTE.test(row.paymentDisputeStatus || '') ? [
            { id: 'dispute-evidence', label: 'Add evidence', input: { fields: [
              { name: 'evidenceType', label: 'What the photo proves', options: Object.entries(EVIDENCE_TYPES).map(([value, label]) => ({ value, label })) },
              { name: 'file', label: 'Photo (JPEG or PNG, up to 5 MB)', type: 'file', accept: 'image/jpeg,image/png' },
            ] } },
            { id: 'dispute-contest', label: 'Contest', confirm: `Contest payment dispute ${row.paymentDisputeId}? Add all your evidence first: eBay doesn't take more after you contest.`, input: { fields: [
              { name: 'note', label: 'Note to eBay', type: 'textarea', maxLength: 1000, optional: true },
              ...(row.reason === 'SIGNIFICANTLY_NOT_AS_DESCRIBED' ? ADDRESS_FIELDS : []),
            ] } },
            { id: 'dispute-accept', label: 'Accept', confirm: `Accept payment dispute ${row.paymentDisputeId}? eBay refunds the buyer.` },
          ] : []),
        ],
      })) || [], 'payment disputes'),
    },
  ])
  const byId = Object.fromEntries(list.map((t) => [t.id, t.rows]))
  const canAnswer = (r) => r.actions.some((a) => a.id === 'dispute-accept')
  const open = (rows) => (rows || []).filter((row) => !CLOSED.test(row.status)).length
  return {
    summary: [
      { label: 'Open returns', value: open(byId.returns), type: 'number' },
      { label: 'Open cancellations', value: open(byId.cancellations), type: 'number' },
      { label: 'Open inquiries', value: open(byId.inquiries), type: 'number' },
      { label: 'Open cases', value: open(byId.cases), type: 'number' },
      { label: 'Open disputes', value: (byId.disputes || []).filter(canAnswer).length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[name](token, shop, id) → { title, summary, tables }`. */
returnsCases.details = {
  /** A payment dispute: what eBay asks for, the evidence on file, and what happened. */
  dispute: async (token, shop, id) => {
    const base = `${ebayApiz()}/sell/fulfillment/v1/payment_dispute/${encodeURIComponent(id)}`
    const [d, history] = await Promise.all([ebayGet(token, base), ebayGet(token, `${base}/activity`).catch(() => ({ activity: [] }))])
    const typeOf = (t) => EVIDENCE_TYPES[t] || words(t)
    return {
      title: `Payment dispute ${id}`,
      summary: [
        { label: 'Status', value: words(d.paymentDisputeStatus), type: 'text' },
        { label: 'Reason', value: words(d.reason), type: 'text' },
        { label: 'Amount', value: money(d.amount), type: 'money' },
        { label: 'Respond by', value: d.respondByDate ? d.respondByDate.slice(0, 10) : '—', type: 'text' },
      ],
      tables: [
        {
          id: 'requests',
          title: 'Evidence eBay asks for',
          columns: [col('type', 'Evidence'), col('requested', 'Asked', 'date'), col('respondBy', 'Respond by', 'date')],
          rows: (d.evidenceRequests || []).map((e) => ({ type: typeOf(e.evidenceType), requested: e.requestDate || null, respondBy: e.respondByDate || null })),
        },
        {
          id: 'evidence',
          title: 'Evidence you sent',
          columns: [col('type', 'Evidence'), col('files', 'Files'), col('provided', 'Sent', 'date')],
          rows: (d.evidence || []).map((e) => ({ type: typeOf(e.evidenceType), files: (e.files || []).map((f) => f.name || f.fileId).join(', '), provided: e.providedDate || null })),
        },
        {
          id: 'activity',
          title: 'History',
          columns: [col('when', 'When', 'date'), col('what', 'What'), col('who', 'By')],
          rows: (history.activity || []).map((a) => ({ when: a.activityDate || null, what: words(a.activityType), who: words(a.actor) })),
        },
      ],
    }
  },
}

module.exports = returnsCases
