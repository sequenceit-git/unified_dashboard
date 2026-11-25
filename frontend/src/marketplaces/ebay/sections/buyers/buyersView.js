/** What the eBay Buyers page shows: buyer pills, the header, links to orders and each buyer's feedback. */

export function buyerPills(counts, feedback) {
  return [
    { key: 'all', label: 'All buyers', count: counts ? counts.all : null },
    { key: 'repeat', label: 'Repeat buyers', count: counts ? counts.repeat : null },
    { key: 'received', label: 'Feedback received', count: feedback?.received ?? null },
    { key: 'awaiting', label: 'Waiting for your feedback', count: feedback?.awaiting ?? null },
  ]
}

export function buyerSummary(counts, q = '', positive = null) {
  if (!counts) return ''
  const share = counts.all && counts.repeat ? ` (${Math.round((counts.repeat / counts.all) * 100)}%)` : ''
  return [
    `${counts.all}${String(q).trim() ? ' matching' : ''} buyer${counts.all === 1 ? '' : 's'} · ${counts.repeat} repeat buyer${counts.repeat === 1 ? '' : 's'}${share}`,
    positive != null && `${Number(positive).toFixed(1)}% positive feedback`,
  ].filter(Boolean).join(' · ')
}

/** The order on the eBay Orders page (it searches by ?q=). */
export const orderLink = (order) => (order?.externalOrderId ? `/ebay/orders?q=${encodeURIComponent(order.externalOrderId)}` : null)

/** Feedback this buyer left you (matched by their eBay user names). */
export function feedbackFrom(rows, customer) {
  const names = new Set((customer?.identities || []).filter((i) => i.marketplace === 'ebay').map((i) => String(i.username || '').toLowerCase()).filter(Boolean))
  if (!names.size) return []
  return (rows || []).filter((r) => names.has(String(r.buyer || '').toLowerCase()))
}
