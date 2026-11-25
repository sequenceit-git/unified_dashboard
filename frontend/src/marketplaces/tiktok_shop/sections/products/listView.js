/** What the TikTok Shop Products page shows: status pills, summary, needs attention, each row's next step. */

const PILLS = [
  ['all', 'All', 'all'],
  ['live', 'Live', 'live'],
  ['unlisted', 'Not listed', 'unlisted'],
  ['out_of_stock', 'Out of stock', 'out_of_stock'],
  ['paused', 'Deactivated', 'paused'],
  ['ended', 'Deleted', 'ended'],
  ['error', 'Problems', 'error'],
  ['pending', 'Pending', 'pending'],
]

/** Pills with counts; `listing` is the filter each asks the server for. Pending only shows when there are some. */
export function statusPills(counts) {
  return PILLS
    .filter(([key]) => key !== 'pending' || counts?.pending > 0)
    .map(([key, label, listing]) => ({ key, label, listing, count: counts ? counts[key] ?? 0 : null }))
}

const attention = (c) => (c?.error || 0) + (c?.out_of_stock || 0) + (c?.suspended || 0)

export function summaryLine(counts) {
  if (!counts) return ''
  const n = attention(counts)
  return `${counts.all} products · ${counts.live} live${n ? ` · ${n} need attention` : ''}`
}

/** Problems that exist now; each selects the pill that lists them. */
export function attentionItems(counts) {
  const items = []
  if (counts?.error) items.push({ id: 'error', text: `${counts.error} failed to list`, pill: 'error', action: 'Fix' })
  if (counts?.out_of_stock) items.push({ id: 'out', text: `${counts.out_of_stock} live but out of stock`, pill: 'out_of_stock', action: 'Restock' })
  // Suspended or frozen by TikTok: listed under Deactivated; only TikTok can lift it.
  if (counts?.suspended) items.push({ id: 'suspended', text: `${counts.suspended} suspended or frozen by TikTok`, pill: 'paused', action: 'Review' })
  return items
}

/**
 * The one thing to do next with a row. `listLabel`: TikTok's own wording for listing (the shop profile's,
 * e.g. "Publish to TikTok Shop"). `shopActions`: TikTok's listing actions that apply to this row's listing
 * (Publish a deactivated one, Recover a deleted one); a deactivated or deleted row's main action is the
 * first that isn't destructive, or Edit when none applies (suspended or frozen by TikTok).
 */
export function mainAction(row, { canRestock = true, listLabel = 'List on TikTok Shop', shopActions = [] } = {}) {
  const status = row?.shopListing?.status
  if (!status) return { id: 'list', label: listLabel }
  if (status === 'out_of_stock') return canRestock ? { id: 'restock', label: 'Restock' } : { id: 'edit', label: 'Edit' }
  if (status === 'error') return { id: 'fix', label: 'Fix' }
  if (status === 'ended' || status === 'paused') {
    const action = shopActions.find((a) => !a.danger)
    if (action) return { id: 'shop', label: action.label, action }
  }
  return { id: 'edit', label: 'Edit' }
}

/** TikTok's product id from a stored listing id ("<productId>" or "<productId>:<skuId>"). */
export function itemId(externalListingId) {
  return String(externalListingId || '').split(':')[0]
}
