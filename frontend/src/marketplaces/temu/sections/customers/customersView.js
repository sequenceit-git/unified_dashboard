/** What the Temu Customers page shows: pills, the header summary and links to orders. */

export function customerPills(counts) {
  return [
    { key: 'all', label: 'All buyers', count: counts ? counts.all : null },
    { key: 'repeat', label: 'Repeat buyers', count: counts ? counts.repeat : null },
  ]
}

export function customerSummary(counts, q = '') {
  if (!counts) return ''
  const share = counts.all && counts.repeat ? ` (${Math.round((counts.repeat / counts.all) * 100)}%)` : ''
  return `${counts.all}${String(q).trim() ? ' matching' : ''} buyer${counts.all === 1 ? '' : 's'} · ${counts.repeat} repeat buyer${counts.repeat === 1 ? '' : 's'}${share}`
}

/** The order on the Temu Orders page (it searches by ?q=). */
export const orderLink = (order) => (order?.externalOrderId ? `/temu/orders?q=${encodeURIComponent(order.externalOrderId)}` : null)
