/** What the eBay Listings page shows: status pills, summary, needs attention, each row's next step, views. */
import { rarelyClicked } from '../analytics/analyticsView'

const PILLS = [
  ['all', 'All', 'all'],
  ['live', 'Live', 'live'],
  ['unlisted', 'Not listed', 'unlisted'],
  ['out_of_stock', 'Out of stock', 'out_of_stock'],
  ['ended', 'Ended', 'closed'],
  ['error', 'Problems', 'error'],
  ['pending', 'Pending', 'pending'],
]

/** Pills with counts; `listing` is the filter each asks the server for. Pending only shows when there are some. */
export function statusPills(counts) {
  return PILLS
    .filter(([key]) => key !== 'pending' || counts?.pending > 0)
    .map(([key, label, listing]) => ({ key, label, listing, count: counts ? counts[key] ?? 0 : null }))
}

const attention = (c) => (c?.error || 0) + (c?.out_of_stock || 0)

export function summaryLine(counts) {
  if (!counts) return ''
  const n = attention(counts)
  return `${counts.all} listings · ${counts.live} live${n ? ` · ${n} need attention` : ''}`
}

/** Problems that exist now; each selects the pill that lists them. */
export function attentionItems(counts) {
  const items = []
  if (counts?.error) items.push({ id: 'error', text: `${counts.error} failed to list`, pill: 'error', action: 'Fix' })
  if (counts?.out_of_stock) items.push({ id: 'out', text: `${counts.out_of_stock} live but out of stock`, pill: 'out_of_stock', action: 'Restock' })
  return items
}

/** The one thing to do next with a row. */
export function mainAction(row) {
  const status = row?.shopListing?.status
  if (!status) return { id: 'list', label: 'List on eBay' }
  if (status === 'out_of_stock') return { id: 'restock', label: 'Restock' }
  if (status === 'error') return { id: 'fix', label: 'Fix' }
  if (status === 'ended' || status === 'paused') return { id: 'relist', label: 'Relist' }
  return { id: 'edit', label: 'Edit' }
}

/** eBay's item number from a stored listing id ("ebay-item-123", "item-123" or "123"). */
export function itemId(externalListingId) {
  return String(externalListingId || '').replace(/^(ebay-)?item-/, '')
}

/** Item number → { views, rarelyClicked } from the 30-day listing traffic. */
export function trafficByItem(rows) {
  const flagged = rarelyClicked(rows || [])
  return new Map((rows || []).map((r) => [String(r.listingId), { views: r.views, rarelyClicked: flagged.has(r.listingId) }]))
}
