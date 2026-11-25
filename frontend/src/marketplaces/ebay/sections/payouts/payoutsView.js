/** What the eBay Payouts page shows: funds on top, a pill per list, and each list's own totals. */

// `tiles`: the loader summary labels that belong to the pill (Payouts and Transactions share a tab).
export const PAYOUT_PILLS = [
  { key: 'payouts', label: 'Payouts', table: 'payouts', tiles: ['Paid out', 'Payouts', 'Transactions'] },
  { key: 'transactions', label: 'Transactions', table: 'transactions', tiles: ['Sales paid out (90 days)', 'Refunds paid out (90 days)', 'Shipping labels paid out (90 days)'] },
  { key: 'earnings', label: 'Order earnings', table: 'earnings' },
  { key: 'bill', label: 'eBay bill', table: 'billing' },
]

const KNOWN_TABS = ['Funds', 'Payouts', 'Order earnings', 'eBay bill']
const PAGE = 15

/** The funds tiles (available, processing, on hold, total) — always on top. */
export const fundsTiles = (summary) => (summary || []).filter((s) => s.tab === 'Funds')

/**
 * The totals that belong to a pill: its own labels when it has a list, else its table's tab. Tiles
 * with no tab or an unknown tab show on the Payouts pill, so none are lost.
 */
export function tilesFor(summary, table, pill) {
  const all = (summary || []).filter((s) => s.tab !== 'Funds')
  const own = pill?.tiles ? all.filter((s) => pill.tiles.includes(s.label)) : table?.tab ? all.filter((s) => s.tab === table.tab) : []
  const orphans = pill?.key === 'payouts' ? all.filter((s) => !s.tab || !KNOWN_TABS.includes(s.tab)) : []
  return [...own, ...orphans]
}

/** One page of a list (15 rows), and how many pages there are. */
export function pageOf(rows, page) {
  const pages = Math.max(1, Math.ceil((rows || []).length / PAGE))
  const p = Math.min(Math.max(1, page), pages)
  return { rows: (rows || []).slice((p - 1) * PAGE, p * PAGE), page: p, pages }
}

/** The header line: what you can be paid next, what's held, and what was paid out (in the shop's currency). */
export function payoutSummary(summary) {
  const by = Object.fromEntries((summary || []).map((s) => [s.label, s.value]))
  const amount = (m) => (m && typeof m === 'object' ? m.value : m)
  const fmt = (m) => {
    if (amount(m) == null) return null
    const currency = (m && typeof m === 'object' && m.currency) || 'USD'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount(m)))
  }
  return [
    by.Available != null && `${fmt(by.Available)} available`,
    amount(by['On hold']) ? `${fmt(by['On hold'])} on hold` : null,
    by['Paid out'] != null && `${fmt(by['Paid out'])} paid out`,
  ].filter(Boolean).join(' · ')
}
