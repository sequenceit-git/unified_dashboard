/** What the Temu Goods page shows: Temu's state pills, needs attention, each row's next step, signal chips. */

const PILLS = [
  ['all', 'All'], ['live', 'On sale'], ['pending', 'Under review'], ['unlisted', 'Not on Temu'],
  ['out_of_stock', 'Sold out'], ['paused', 'Off sale'], ['error', 'Rejected'], ['ended', 'Removed'],
]

/** Pills with counts; the key is also the listing filter sent to the server. Removed only when there are some. */
export function statusPills(counts) {
  return PILLS
    .filter(([key]) => key !== 'ended' || counts?.ended > 0)
    .map(([key, label]) => ({ key, label, listing: key, count: counts ? counts[key] ?? 0 : null }))
}

/** Rows with each signal (the server counts them like the pills: one per stored row). */
export function signalTotals(signals) {
  const t = signals?.totals || {}
  return { restricted: t.restricted || 0, low: t.low || 0, compliance: t.compliance || 0, priceReview: t.priceReview || 0 }
}

/** Problems that exist now; each selects a pill or goes to the page that fixes it. */
export function attentionItems(counts, totals) {
  const items = []
  if (counts?.error) items.push({ id: 'error', text: `${counts.error} rejected by Temu`, pill: 'error', action: 'Fix' })
  if (counts?.out_of_stock) items.push({ id: 'out', text: `${counts.out_of_stock} sold out`, pill: 'out_of_stock', action: 'Restock' })
  if (totals?.restricted) items.push({ id: 'restricted', text: `${totals.restricted} traffic-restricted by Temu`, to: '/temu/analytics', action: 'See why' })
  if (totals?.priceReview) items.push({ id: 'price', text: `${totals.priceReview} price review waiting`, to: '/temu/price-reviews', action: 'Price reviews' })
  return items
}

export function summaryLine(counts, totals) {
  if (!counts) return ''
  const n = (counts.error || 0) + (counts.out_of_stock || 0) + (totals?.restricted || 0) + (totals?.priceReview || 0)
  return `${counts.all} goods · ${counts.live} on sale${n ? ` · ${n} need attention` : ''}`
}

/** The one thing to do next with a goods. */
export function mainAction(row, { canRestock = true } = {}) {
  const status = row?.shopListing?.status
  if (!status || status === 'ended') return { id: 'list', label: 'List on Temu' }
  if (status === 'error') return { id: 'fix', label: 'Fix' }
  if (status === 'out_of_stock') return canRestock ? { id: 'restock', label: 'Restock' } : { id: 'edit', label: 'Edit' }
  if (status === 'paused') return { id: 'publish', label: 'Put on sale' }
  return { id: 'edit', label: 'Edit' }
}

/** Temu's goods id from a stored listing id ("<goodsId>:<skuId>"). */
export function goodsIdOf(externalListingId) {
  return String(externalListingId || '').split(':')[0]
}

export function chipsFor(signal) {
  if (!signal) return []
  return [
    ...(signal.traffic ? [{ label: signal.traffic, tone: signal.traffic === 'Traffic restricted' ? 'red' : 'amber' }] : []),
    ...(signal.compliance ? [{ label: 'Compliance to check', tone: 'blue' }] : []),
    ...(signal.priceReview ? [{ label: 'Price review waiting', tone: 'blue' }] : []),
  ]
}
