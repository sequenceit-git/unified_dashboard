/** What the Temu analytics page shows: periods, changes, the "Needs attention" list, Temu's insights. */

export const PERIODS = [7, 30, 60, 90].map((d) => ({ value: String(d), label: `Last ${d} days` }))

/** Returns per 100 orders at or above this are flagged in Needs attention. */
export const RETURNS_ALERT = 5

const round1 = (n) => Math.round(n * 10) / 10

/** The last `days` days (to the end of today) and the same number of days just before them. */
export function periodRanges(days, now = new Date()) {
  const n = Number(days)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (n - 1))
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - n)
  return {
    current: { from: start.toISOString(), to: end.toISOString() },
    previous: { from: prevStart.toISOString(), to: new Date(start.getTime() - 1).toISOString() },
  }
}

/** Percent change, one decimal; null when there is nothing to compare with. */
export function change(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return round1(((current - previous) / previous) * 100)
}

export function margin(profit, revenue) {
  if (!Number.isFinite(profit) || !(revenue > 0)) return null
  return round1((profit / revenue) * 100)
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** One row per day of the current period, with the previous period's revenue on the same day index. */
export function withPrevious(current, previous, days, currentFrom) {
  const n = Number(days)
  const start = new Date(currentFrom)
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - n)
  const now = new Map((current || []).map((r) => [r.date, r]))
  const before = new Map((previous || []).map((r) => [r.date, r]))
  const rows = []
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const p = new Date(prevStart)
    p.setDate(p.getDate() + i)
    const row = now.get(dayKey(d))
    rows.push({ date: dayKey(d), revenue: row?.revenue || 0, orders: row?.orders || 0, prevRevenue: before.get(dayKey(p))?.revenue || 0 })
  }
  return rows
}

/** Temu's insights from the section loader; each table keeps its own error. */
export function insights(section) {
  const table = (id) => (section?.tables || []).find((t) => t.id === id)
  const tiles = section?.summary || []
  const tile = (id) => tiles.find((t) => t.id === id)?.value ?? null
  const traffic = table('traffic')
  const tags = table('store')
  return {
    traffic: traffic ? traffic.rows || [] : null,
    trafficError: traffic?.error || '',
    tags: tags ? tags.rows || [] : null,
    tagsError: tags?.error || '',
    tile,
    adsShown: tiles.some((t) => t.id === 'ad-share' || t.id === 'ad-spend'),
  }
}

export function trafficByGoods(rows) {
  return new Map((rows || []).map((r) => [String(r.goodsId), r.warning]))
}

/** Problems that exist now, each linking to the page that fixes it. */
export function attentionItems({ traffic, inventory, returnsPer100 }) {
  const items = []
  const restricted = (traffic || []).filter((r) => r.warning === 'Traffic restricted').length
  const low = (traffic || []).filter((r) => r.warning === 'Low traffic').length
  if (restricted) items.push({ id: 'restricted', text: `${restricted} goods traffic-restricted`, to: '/temu/goods' })
  if (low) items.push({ id: 'low-traffic', text: `${low} goods with low traffic`, to: '/temu/goods' })
  if (inventory?.lowCount > 0) items.push({ id: 'stock', text: `${inventory.lowCount} low stock, ${inventory.outCount || 0} out of stock`, to: '/temu/inventory' })
  if (returnsPer100 != null && returnsPer100 >= RETURNS_ALERT) items.push({ id: 'returns', text: `Returns ${returnsPer100} per 100 orders (last 30 days)`, to: '/temu/after-sales' })
  return items
}
