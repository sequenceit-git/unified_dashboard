/** What the eBay analytics page shows: periods, changes, traffic, listings to fix, needs attention. */

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const toDay = (s) => new Date(`${s}T00:00:00`)
const addDays = (s, n) => { const d = toDay(s); d.setDate(d.getDate() + n); return dayKey(d) }
const round1 = (n) => Math.round(n * 10) / 10

export const PERIODS = [7, 30, 60, 90].map((d) => ({ value: String(d), label: `Last ${d} days` }))

/** eBay US counts days in US Pacific time; the whole page uses its days. */
export const EBAY_TZ = 'America/Los_Angeles'

/** Yesterday in eBay's time zone: eBay's traffic has no "today". */
export function yesterday(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: EBAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return addDays(today, -1)
}

/** Every day from `from` to `to`, days eBay left out counting zero. */
export function fillDays(days, from, to) {
  const byDate = new Map((days || []).map((d) => [d.date, d]))
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(byDate.get(d) || { date: d, impressions: 0, views: 0, sold: 0 })
  return out
}

/** `days` whole calendar days ending on `endDay`, and the same number of days just before them. */
export function periodRanges(days, endDay) {
  const n = Number(days)
  return {
    current: { from: addDays(endDay, -(n - 1)), to: endDay },
    previous: { from: addDays(endDay, -(2 * n - 1)), to: addDays(endDay, -n) },
  }
}

/** Percent change, one decimal; null when there is nothing to compare with. */
export function change(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return round1(((current - previous) / Math.abs(previous)) * 100)
}

export function pointsChange(current, previous) {
  if (current == null || previous == null) return null
  return round1(current - previous)
}

export function margin(profit, revenue) {
  if (!Number.isFinite(profit) || !(revenue > 0)) return null
  return round1((profit / revenue) * 100)
}

/** Period traffic: click-through = views ÷ impressions, conversion = sold ÷ views. */
export function trafficTotals(days) {
  const list = days || []
  const sum = (k) => list.reduce((s, d) => s + (Number(d[k]) || 0), 0)
  const impressions = sum('impressions')
  const views = sum('views')
  const sold = sum('sold')
  return {
    impressions,
    views,
    sold,
    ctr: impressions ? round1((views / impressions) * 100) : null,
    conversion: views ? round1((sold / views) * 100) : null,
  }
}

/** One row per day of the current period with the previous period's revenue on the same day index. */
export function withPrevious(current, previous, days, currentFrom) {
  const n = Number(days)
  const now = new Map((current || []).map((r) => [r.date, r]))
  const before = new Map((previous || []).map((r) => [r.date, r]))
  const prevFrom = addDays(currentFrom, -n)
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(currentFrom, i)
    return { date, revenue: now.get(date)?.revenue || 0, prevRevenue: before.get(addDays(prevFrom, i))?.revenue || 0 }
  })
}

/** Listings buyers see in search but rarely open: 100+ impressions, click-through under half the shop's. */
export function rarelyClicked(rows) {
  const list = rows || []
  const imp = list.reduce((s, r) => s + (r.impressions || 0), 0)
  const views = list.reduce((s, r) => s + (r.views || 0), 0)
  if (!imp) return new Set()
  const shop = views / imp
  return new Set(list.filter((r) => r.impressions >= 100 && r.views / r.impressions < shop / 2).map((r) => r.listingId))
}

const WORSE = new Set(['HIGH', 'VERY_HIGH'])

/** Problems that exist now; each links to its page or opens its eBay breakdown. */
export function attentionItems({ standards, service, inventory }) {
  const items = []
  for (const s of standards || []) {
    if (s.levelCode === 'BELOW_STANDARD') items.push({ id: `level:${s.id}`, text: `Seller level: ${s.level} (${s.program}, ${s.cycle})`, detail: { action: 'standards', id: s.id } })
  }
  for (const m of service || []) {
    if (WORSE.has(m.ratingCode)) items.push({ id: `service:${m.metric}:${m.category}`, text: `"${m.metric}" rate higher than similar sellers${m.category ? ` (${m.category})` : ''}` })
  }
  if (inventory?.lowCount > 0) items.push({ id: 'stock', text: `${inventory.lowCount - (inventory.outCount || 0)} low stock, ${inventory.outCount || 0} out of stock`, to: '/ebay/inventory' })
  return items
}

/** A failed check never reads as "All good". */
export function attentionStatus({ items, loading, error }) {
  if (items.length) return 'problems'
  if (loading) return 'loading'
  if (error) return 'error'
  return 'all-good'
}
