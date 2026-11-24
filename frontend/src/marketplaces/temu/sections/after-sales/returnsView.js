/** What the Temu Returns & refunds page shows and allows (Temu lets apps approve only). */

const CLOSED = /refunded|rejected|cancelled|closed|complete|finish|success/i
const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY = 86400000

export const isOpenReturn = (status) => !CLOSED.test(String(status || ''))

/** Approve & refund: open requests, not while Temu itself is reviewing. */
export function canApproveReturn(status) {
  const s = String(status || '')
  if (/platform reviewing/i.test(s)) return false
  return /pending|requested|open|buyer shipped|package shipped/i.test(s)
}

/** Cancellations waiting for an answer: Temu's "Pending" (status 1), as the loader counts them. */
export function canApproveCancel(status) {
  return String(status || '') === 'Pending'
}

/** For open requests: "in N days", "today" or "overdue N days" (null otherwise). */
export function respondText(row, now = new Date()) {
  if (!row?.respondBy || !canApproveReturn(row.status)) return null
  const due = new Date(row.respondBy)
  const days = Math.round((day(due) - day(now)) / DAY)
  if (due < now) return { text: `overdue ${Math.max(1, -days)} day${Math.max(1, -days) === 1 ? '' : 's'}`, late: true }
  return { text: days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`, late: false }
}

/** Open first, the most urgent first; closed after. */
export function sortOpenFirst(rows) {
  const key = (r) => (isOpenReturn(r.status) ? (r.respondBy ? new Date(r.respondBy).getTime() : Infinity) : Infinity + 1)
  return [...(rows || [])].map((r, i) => [r, i]).sort((a, b) => {
    const oa = isOpenReturn(a[0].status) ? 0 : 1
    const ob = isOpenReturn(b[0].status) ? 0 : 1
    return oa - ob || (oa === 0 ? key(a[0]) - key(b[0]) : 0) || a[1] - b[1]
  }).map(([r]) => r)
}

export function returnPills(returns, cancels) {
  const r = returns || []
  return [
    { key: 'open', label: 'Open returns', count: returns ? r.filter((x) => isOpenReturn(x.status)).length : null },
    { key: 'cancellations', label: 'Cancellation requests', count: cancels ? cancels.filter((c) => canApproveCancel(c.status)).length : null },
    { key: 'closed', label: 'Closed', count: returns ? r.filter((x) => !isOpenReturn(x.status)).length : null },
    { key: 'all', label: 'All returns', count: returns ? r.length : null },
  ]
}

export function returnsAttention(returns, cancels, now = new Date()) {
  const items = []
  // Only requests the seller can answer (not while Temu itself reviews).
  const open = (returns || []).filter((r) => canApproveReturn(r.status) && r.respondBy)
  const overdue = open.filter((r) => new Date(r.respondBy) < now).length
  const soon = open.filter((r) => { const d = new Date(r.respondBy); return d >= now && d - now <= 2 * DAY }).length
  const waiting = (cancels || []).filter((c) => canApproveCancel(c.status)).length
  if (overdue) items.push({ id: 'overdue', text: `${overdue} overdue for your answer`, pill: 'open', action: 'Answer' })
  if (soon) items.push({ id: 'soon', text: `${soon} due within 2 days`, pill: 'open', action: 'Answer' })
  if (waiting) items.push({ id: 'cancels', text: `${waiting} cancellation request${waiting === 1 ? '' : 's'} waiting`, pill: 'cancellations', action: 'Approve' })
  return items
}
