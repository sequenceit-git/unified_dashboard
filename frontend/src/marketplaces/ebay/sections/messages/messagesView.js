/** What the eBay inbox shows: filter pills, list times and the item card of a conversation. */

export const INBOX_PILLS = [
  { key: 'buyers', label: 'Buyer messages' },
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'Everything' },
  { key: 'notices', label: 'eBay notices' },
]

const sameDay = (a, b) => a.toDateString() === b.toDateString()

/** Today: the time; the last 6 days: the weekday; older: day and month. */
export function shortTime(value, now = new Date()) {
  if (!value) return ''
  const d = new Date(value)
  if (sameDay(d, now)) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const days = (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000
  if (days < 7) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** The order the conversation is about (populated by the server), as the card on top of the thread. */
export function itemCard(thread) {
  const order = thread?.orderId
  if (!order || typeof order !== 'object') return null
  const items = order.items || []
  return {
    title: items[0]?.title || `Order ${order.externalOrderId}`,
    more: Math.max(0, items.length - 1),
    units: items.reduce((t, it) => t + (Number(it.quantity) || 0), 0),
    orderId: order.externalOrderId,
    status: order.status,
    total: order.totals?.total ?? null,
  }
}
