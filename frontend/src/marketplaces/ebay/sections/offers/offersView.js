/** What the eBay Best offers page shows: waiting offers by expiry, offer vs your price and margins. */

const DAY = 86400000
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const time = (v) => (v ? new Date(v).getTime() : Infinity)

export function expiresText(row, now = new Date()) {
  if (!row?.expires) return null
  const end = new Date(row.expires)
  if (end < now) return { text: 'expired', soon: true }
  const days = Math.round((dayStart(end) - dayStart(now)) / DAY)
  return days <= 0 ? { text: 'today', soon: true } : { text: `in ${days} day${days === 1 ? '' : 's'}`, soon: days <= 1 }
}

export const bySoonest = (rows) => [...(rows || [])].sort((a, b) => time(a.expires) - time(b.expires))

export function summaryLine(offers, watched, now = new Date()) {
  if (!offers) return ''
  const today = offers.filter((r) => expiresText(r, now)?.text === 'today').length
  return [
    `${offers.length} offer${offers.length === 1 ? '' : 's'} waiting`,
    today && `${today} expire${today === 1 ? 's' : ''} today`,
    watched != null && `${watched} listing${watched === 1 ? '' : 's'} with watchers`,
  ].filter(Boolean).join(' · ')
}

/** What's left after cost at a price; null when the cost isn't known. */
export function margin(price, cost) {
  if (cost == null || price == null || !Number.isFinite(Number(price))) return null
  const value = Math.round((Number(price) - Number(cost)) * 100) / 100
  const pct = Number(price) ? Math.round((value / Number(price)) * 100) : 0
  // Price minus cost only: eBay fees and shipping come on top.
  const text = value < 0 ? `loss of $${Math.abs(value).toFixed(2)} before fees` : `$${value.toFixed(2)} margin before fees (${pct}%)`
  return { value, pct, text, loss: value < 0 }
}

export const discounted = (price, pct) => (price == null ? null : Math.round(Number(price) * (1 - Number(pct || 0) / 100) * 100) / 100)
