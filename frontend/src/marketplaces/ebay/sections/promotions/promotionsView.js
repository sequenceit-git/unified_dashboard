/**
 * What the eBay Promotions page shows: promotions by state with their results inline, which ones
 * can be paused / resumed, and the New promotion steps' checks.
 */

const STATE = (status) => (/running|active/i.test(status) ? 'running' : /scheduled|draft|pending/i.test(status) ? 'scheduled' : /pause/i.test(status) ? 'paused' : 'ended')

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
    { key: 'scheduled', label: 'Scheduled', count: count('scheduled') },
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
  if (row.state === 'running' || row.state === 'scheduled') return { verb: 'pause', label: 'Pause' }
  return null
}

/** New promotion: what's still missing, per step. */
export function newPromotionProblems({ discount, wholeStore, listingIds, start, end }, now = new Date()) {
  const problems = []
  const pct = Number(discount)
  if (!Number.isInteger(pct) || pct < 5 || pct > 80) problems.push({ step: 'discount', field: 'discount', message: 'The discount is a whole number from 5 to 80 (% off).' })
  if (!wholeStore && !listingIds.length) problems.push({ step: 'listings', field: 'listings', message: 'Pick listings, or choose the whole store.' })
  if (!wholeStore && listingIds.length > 500) problems.push({ step: 'listings', field: 'listings', message: 'eBay takes up to 500 listings in one sale.' })
  const s = start ? new Date(start) : null
  const e = end ? new Date(end) : null
  if (!e || Number.isNaN(e.getTime())) problems.push({ step: 'dates', field: 'end', message: 'Choose when the sale ends.' })
  else if (e <= (s && !Number.isNaN(s.getTime()) ? s : now)) problems.push({ step: 'dates', field: 'end', message: 'The end is after the start.' })
  return problems
}
