/** What the Temu Shipping page shows: tiles, labels in the order that needs looking at, each row's order. */

const table = (section, id) => (section?.tables || []).find((t) => t.id === id)
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function shippingTiles(section, now = new Date()) {
  const unshipped = table(section, 'unshipped')
  const labels = table(section, 'labels')
  if (!section) return { awaiting: null, boughtToday: null, failed: null, notPrinted: null }
  const rows = labels?.rows || []
  // A table Temu didn't load (error) gives no number rather than 0.
  const ok = (t) => t && !t.error
  return {
    awaiting: ok(unshipped) ? unshipped.rows.length : null,
    boughtToday: ok(labels) ? rows.filter((r) => r.status === 'Bought' && r.created && sameDay(new Date(r.created), now)).length : null,
    failed: ok(labels) ? rows.filter((r) => r.status === 'Failed').length : null,
    notPrinted: ok(labels) ? rows.filter((r) => r.status === 'Bought' && r.printed === 'No').length : null,
  }
}

/** Failed labels first, then the newest. */
export function labelRows(rows) {
  const rank = (r) => (r.status === 'Failed' ? 0 : 1)
  return [...(rows || [])].sort((a, b) => rank(a) - rank(b) || String(b.created || '').localeCompare(String(a.created || '')))
}

/** The (first) Temu order a row belongs to. */
export function orderOf(row) {
  return String(row?.order || row?.orders || '').split(',')[0].trim()
}
