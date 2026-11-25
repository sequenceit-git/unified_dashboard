/** What the Temu Orders page shows: state pills, needs attention, ship-by and each order's next step. */

const PILLS = [
  // All first; the page still opens on To ship.
  ['all', 'All', {}],
  ['toShip', 'To ship', { status: 'paid,processing' }],
  ['late', 'Late', { late: '1' }],
  ['shipped', 'Shipped', { status: 'shipped' }],
  ['delivered', 'Delivered', { status: 'delivered' }],
  ['cancelled', 'Cancelled', { status: 'cancelled' }],
  ['unpaid', 'Unpaid', { status: 'pending' }],
  ['returns', 'Returns & refunds', { status: 'returned,refunded' }],
]

/** Pills with counts; `query` is what the list asks the server for. Late and Unpaid only when there are some. */
export function orderPills(counts) {
  return PILLS
    .filter(([key]) => !['late', 'unpaid', 'returns'].includes(key) || counts?.[key] > 0)
    .map(([key, label, query]) => ({ key, label, query, count: counts ? counts[key] ?? 0 : null }))
}

export function summaryLine(counts) {
  if (!counts) return ''
  return `${counts.all} orders · ${counts.toShip} to ship${counts.late ? ` · ${counts.late} past ship-by` : ''}`
}

/** Problems that exist now: late orders (their pill) and orders Temu lets you combine (Ship together). */
export function attentionItems(counts, combineGroups) {
  const items = []
  if (counts?.late) items.push({ id: 'late', text: `${counts.late} past the ship-by date`, pill: 'late', action: 'Ship now' })
  if (combineGroups) items.push({ id: 'combine', text: `${combineGroups} groups of orders can ship together`, combine: true, action: 'Ship together' })
  return items
}

const DAY = 86400000
// The user's own calendar day.
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const TO_SHIP = ['paid', 'processing']

/** For orders still to ship: "today", "in 2 days" or "late 2 days" (null otherwise). */
export function shipByText(order, now = new Date()) {
  const raw = order?.shipping?.shipBy
  if (!TO_SHIP.includes(order?.status) || !raw) return null
  const due = new Date(raw)
  if (due < now) {
    const days = Math.max(1, Math.round((dayStart(now) - dayStart(due)) / DAY))
    return { text: `late ${days} day${days === 1 ? '' : 's'}`, late: true }
  }
  const days = Math.round((dayStart(due) - dayStart(now)) / DAY)
  return { text: days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`, late: false }
}

/** The one thing to do next with an order (both open the order; Ship lands on its shipping part). */
export function mainAction(order) {
  return TO_SHIP.includes(order?.status) ? { id: 'ship', label: 'Ship', primary: true } : { id: 'details', label: 'Details' }
}
