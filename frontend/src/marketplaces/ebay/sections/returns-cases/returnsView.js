/**
 * What the eBay Returns & cases page shows: the five kinds of request eBay's loader gives (returns,
 * cancellations, item-not-received inquiries, cases, payment disputes), by deadline, and what the
 * seller can do with each.
 */

export const KINDS = [
  { key: 'returns', label: 'Returns', detail: 'return', idKey: 'returnId' },
  { key: 'cancellations', label: 'Cancellations', detail: null, idKey: 'cancelId' },
  { key: 'inquiries', label: 'Not received', detail: 'inquiry', idKey: 'inquiryId' },
  { key: 'cases', label: 'Cases', detail: 'case', idKey: 'caseId' },
  { key: 'disputes', label: 'Payment disputes', detail: 'dispute', idKey: 'id' },
]

// The same rules as the old Approve / Decline buttons.
export function canDecideReturn(status) {
  const s = String(status || '')
  const actionable = /pending|requested|open|buyer shipped|package shipped/i.test(s)
  return actionable || !/closed|complete|finish|reject|declined|approved|refund|awaiting buyer|cancel|success/i.test(s)
}
export function canDecideCancel(status) {
  const s = String(status || '')
  const open = /pending|requested|open|waiting/i.test(s)
  return open || !/closed|complete|finish|reject|declined|approved|cancel|success|refunded/i.test(s)
}

const doable = (row) => (row.actions || []).filter((a) => !a.detail)

/** Whether the seller can still do something with this request. */
export function isOpen(row, kind) {
  if (kind === 'returns' && canDecideReturn(row.status)) return true
  if (kind === 'cancellations') return canDecideCancel(row.status)
  return doable(row).length > 0
}

const time = (v) => (v ? new Date(v).getTime() : Infinity)

/** Each kind: its rows (open first, then by deadline), count (null when eBay didn't load it) and open count. */
export function kindsOf(section) {
  return KINDS.map((k) => {
    const table = (section?.tables || []).find((t) => t.id === k.key)
    if (!table || table.error) return { ...k, rows: [], count: null, open: null, error: table?.error || '' }
    const rows = table.rows
      .map((r) => ({ ...r, id: r.id ?? String(r[k.idKey] ?? '') }))
      .sort((a, b) => Number(isOpen(b, k.key)) - Number(isOpen(a, k.key)) || time(a.respondBy) - time(b.respondBy) || time(b.created || b.opened) - time(a.created || a.opened))
    return { ...k, rows, count: rows.length, open: rows.filter((r) => isOpen(r, k.key)).length, error: '' }
  })
}

const DAY = 86400000
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function respondText(row, now = new Date()) {
  if (!row?.respondBy) return null
  const due = new Date(row.respondBy)
  const days = Math.round((dayStart(due) - dayStart(now)) / DAY)
  if (due < now) {
    const late = Math.max(0, -days)
    return { text: late ? `overdue ${late} day${late === 1 ? '' : 's'}` : 'overdue today', late: true }
  }
  return { text: days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`, late: false }
}

export function summaryLine(kinds, now = new Date()) {
  const open = kinds.flatMap((k) => k.rows.filter((r) => isOpen(r, k.key)))
  if (!kinds.some((k) => k.count != null)) return ''
  const dated = open.filter((r) => r.respondBy)
  const overdue = dated.filter((r) => new Date(r.respondBy) < now).length
  const next = dated.filter((r) => new Date(r.respondBy) >= now).sort((a, b) => time(a.respondBy) - time(b.respondBy))[0]
  return [`${open.length} need${open.length === 1 ? 's' : ''} a reply`, overdue && `${overdue} overdue`, next && `next deadline ${respondText(next, now).text}`].filter(Boolean).join(' · ')
}

/** The row's main button: Approve where eBay lets the seller decide, Respond when there is something to do, else Details. */
export function mainAction(row, kind) {
  if ((kind === 'returns' && canDecideReturn(row.status)) || (kind === 'cancellations' && canDecideCancel(row.status))) {
    return { id: kind === 'returns' ? 'return-approve' : 'cancel-approve', label: 'Approve', primary: true, decide: true }
  }
  return doable(row).length ? { id: 'open', label: 'Respond', primary: true } : { id: 'open', label: 'Details' }
}

/** Approve / Decline (returns) and Approve / Reject (cancellations), as popups with their fields. */
export function decideActions(row, kind) {
  if (kind === 'returns' && canDecideReturn(row.status)) {
    return [
      { id: 'return-approve', label: 'Approve', confirm: `Approve the return request for order ${row.orderId || row.returnId}?` },
      { id: 'return-decline', label: 'Decline', danger: true, input: { fields: [{ name: 'comments', label: 'Reason for the buyer', type: 'textarea', optional: true }] } },
    ]
  }
  if (kind === 'cancellations' && canDecideCancel(row.status)) {
    return [
      { id: 'cancel-approve', label: 'Approve', confirm: `Approve the cancellation for order ${row.orderId || row.cancelId}?` },
      { id: 'cancel-reject', label: 'Reject', danger: true, input: { fields: [{ name: 'trackingNumber', label: 'Tracking number (eBay needs it if the order already shipped)', optional: true }] } },
    ]
  }
  return []
}
