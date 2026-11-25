/**
 * What the eBay Promotions page shows: promotions by state with their results inline, which ones
 * can be paused / resumed, and the New promotion steps' checks.
 */

const STATE = (status) => (/running|active/i.test(status) ? 'running' : /draft/i.test(status) ? 'draft' : /scheduled|pending/i.test(status) ? 'scheduled' : /pause/i.test(status) ? 'paused' : 'ended')

/** Results rows whose promotion isn't in the list (e.g. deleted since): kept, shown on their own. */
export function otherResults(section) {
  const table = (id) => (section?.tables || []).find((t) => t.id === id)
  const results = table('results')
  if (!results || results.error) return []
  const known = new Set((table('promotions')?.rows || []).map((r) => String(r.promotionId)))
  return results.rows.filter((r) => !known.has(String(r.promotionId)))
}

/** When the sale really starts: a start already past (or within a minute) moves to two minutes from now. */
export function effectiveStart(start, now = new Date()) {
  const s = start ? new Date(start) : null
  const soonest = new Date(now.getTime() + 2 * 60000)
  return !s || Number.isNaN(s.getTime()) || s.getTime() < now.getTime() + 60000 ? soonest : s
}

/** Promotions with their results (from the Results table) and a state for the pills. */
export function promotionRows(section) {
  const table = (id) => (section?.tables || []).find((t) => t.id === id)
  const list = table('promotions')
  const results = table('results')
  if (!list || list.error) return null
  const byId = new Map((results && !results.error ? results.rows : []).map((r) => [String(r.promotionId), r]))
  return list.rows.map((row) => ({ ...row, state: STATE(row.status), result: byId.get(String(row.promotionId)) || null }))
}

export function promotionPills(rows) {
  const count = (state) => (rows ? rows.filter((r) => r.state === state).length : null)
  const pills = [
    { key: 'running', label: 'Running', count: count('running') },
    // Drafts sit with the scheduled ones (they haven't started either).
    { key: 'scheduled', label: 'Scheduled & drafts', count: rows ? rows.filter((r) => r.state === 'scheduled' || r.state === 'draft').length : null },
    { key: 'paused', label: 'Paused', count: count('paused') },
    { key: 'ended', label: 'Ended', count: count('ended') },
    { key: 'all', label: 'All', count: rows ? rows.length : null },
  ]
  return pills.filter((p) => p.key !== 'paused' || p.count)
}

/** eBay pauses / resumes threshold discounts only; markdown sales (item price) have no pause. */
export function pauseAction(row) {
  if (!row?.promotionId || /markdown|item price/i.test(String(row.type || ''))) return null
  if (row.state === 'paused') return { verb: 'resume', label: 'Resume' }
  // eBay pauses running promotions only.
  if (row.state === 'running') return { verb: 'pause', label: 'Pause' }
  return null
}

/** New promotion: what's still missing, per step. */
export function newPromotionProblems({ discount, wholeStore, listingIds, start, end }, now = new Date()) {
  const problems = []
  const pct = Number(discount)
  if (!Number.isInteger(pct) || pct < 5 || pct > 80) problems.push({ step: 'discount', field: 'discount', message: 'The discount is a whole number from 5 to 80 (% off).' })
  if (!wholeStore && !listingIds.length) problems.push({ step: 'listings', field: 'listings', message: 'Pick listings, or choose the whole store.' })
  if (!wholeStore && listingIds.length > 500) problems.push({ step: 'listings', field: 'listings', message: 'eBay takes up to 500 listings in one sale.' })
  const s = effectiveStart(start, now)
  const e = end ? new Date(end) : null
  if (!e || Number.isNaN(e.getTime())) problems.push({ step: 'dates', field: 'end', message: 'Choose when the sale ends.' })
  else if (e <= s) problems.push({ step: 'dates', field: 'end', message: 'The end is after the start.' })
  else if (e - s < 24 * 3600000) problems.push({ step: 'dates', field: 'end', message: 'An eBay sale runs for at least 24 hours.' })
  return problems
}
