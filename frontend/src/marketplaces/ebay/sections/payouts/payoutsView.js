/** What the eBay Payouts page shows: funds on top, a pill per list, and each list's own totals. */

export const PAYOUT_PILLS = [
  { key: 'payouts', label: 'Payouts', table: 'payouts' },
  { key: 'transactions', label: 'Transactions', table: 'transactions' },
  { key: 'earnings', label: 'Order earnings', table: 'earnings' },
  { key: 'bill', label: 'eBay bill', table: 'billing' },
]

/** The funds tiles (available, processing, on hold, total) — always on top. */
export const fundsTiles = (summary) => (summary || []).filter((s) => s.tab === 'Funds')

/** The totals that belong to a list (the loader's summary items for its tab). */
export function tilesFor(summary, table) {
  if (!table?.tab) return []
  return (summary || []).filter((s) => s.tab === table.tab && s.tab !== 'Funds')
}

/** The header line: what you can be paid next, what's held, and what was paid out. */
export function payoutSummary(summary) {
  const by = Object.fromEntries((summary || []).map((s) => [s.label, s.value]))
  const amount = (m) => (m && typeof m === 'object' ? m.value : m)
  const usd = (m) => (amount(m) == null ? null : `$${Number(amount(m)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  return [
    by.Available != null && `${usd(by.Available)} available`,
    amount(by['On hold']) ? `${usd(by['On hold'])} on hold` : null,
    by['Paid out'] != null && `${usd(by['Paid out'])} paid out`,
  ].filter(Boolean).join(' · ')
}
