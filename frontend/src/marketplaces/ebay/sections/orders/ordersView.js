/** What the eBay Orders page shows: state pills, needs attention, ship-by and each order's next step. */

const PILLS = [
  ['toShip', 'To ship', { status: 'paid,processing' }],
  ['late', 'Late', { late: '1' }],
  ['unpaid', 'Unpaid', { status: 'pending' }],
  ['shipped', 'Shipped', { status: 'shipped' }],
  ['delivered', 'Delivered', { status: 'delivered' }],
  ['cancelled', 'Cancelled', { status: 'cancelled' }],
  ['returns', 'Returns & refunds', { status: 'returned,refunded' }],
  ['all', 'All', {}],
]

/** Pills with counts; `query` is what the list asks the server for. Late, Unpaid and Returns only when there are some. */
export function orderPills(counts) {
  return PILLS
    // Without counts (not loaded, or failed) every pill shows, so no state is out of reach.
    .filter(([key]) => !counts || !['late', 'unpaid', 'returns'].includes(key) || counts[key] > 0)
    .map(([key, label, query]) => ({ key, label, query, count: counts ? counts[key] ?? 0 : null }))
}

export function summaryLine(counts) {
  if (!counts) return ''
  return `${counts.all} orders · ${counts.toShip} to ship${counts.late ? ` · ${counts.late} past ship-by` : ''}`
}

/** Problems that exist now: late orders (their pill) and returns waiting for the seller. */
export function attentionItems(counts) {
  const items = []
  if (counts?.late) items.push({ id: 'late', text: `${counts.late} past the ship-by date`, pill: 'late', action: 'Show' })
  if (counts?.returnsRequested) items.push({ id: 'returns', text: `${counts.returnsRequested} return request${counts.returnsRequested === 1 ? '' : 's'} waiting for you`, returns: true, action: 'Returns & cases' })
  return items
}

const DAY = 86400000
// eBay's ship-by date is the end of a day in Pacific time: days are counted on that calendar.
const ZONE = 'America/Los_Angeles'
const dayStart = (d) => {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}
const TO_SHIP = ['paid', 'processing']

/** The ship-by day as eBay means it (its Pacific calendar day). */
export const shipByDate = (raw) => (raw ? new Date(raw).toLocaleDateString(undefined, { timeZone: ZONE }) : '')

/** For orders still to ship: "today", "in 2 days" or "late 2 days" (null otherwise). */
export function shipByText(order, now = new Date()) {
  const raw = order?.shipping?.shipBy
  if (!TO_SHIP.includes(order?.status) || !raw) return null
  const due = new Date(raw)
  if (due < now) {
    const days = Math.round((dayStart(now) - dayStart(due)) / DAY)
    return { text: days <= 0 ? 'late today' : `late ${days} day${days === 1 ? '' : 's'}`, late: true }
  }
  const days = Math.round((dayStart(due) - dayStart(now)) / DAY)
  return { text: days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`, late: false }
}

/** The one thing to do next with an order (both open it; Add tracking lands on its shipping part). */
export function mainAction(order) {
  return TO_SHIP.includes(order?.status) ? { id: 'ship', label: 'Add tracking', primary: true } : { id: 'details', label: 'Details' }
}
