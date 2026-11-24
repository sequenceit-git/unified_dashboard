/** What the TikTok Shop analytics page shows: periods, totals, channels, traffic, shop health. */

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const PERIODS = [7, 30, 60, 90].map((d) => ({ value: String(d), label: `Last ${d} days` }))

const round1 = (n) => Math.round(n * 10) / 10
const round2 = (n) => Math.round(n * 100) / 100
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

const toDay = (s) => new Date(`${s}T00:00:00`)
const addDays = (s, n) => { const d = toDay(s); d.setDate(d.getDate() + n); return dayKey(d) }

/** Today as a calendar day (YYYY-MM-DD, local). */
export function today(now = new Date()) {
  return dayKey(now)
}

/**
 * `days` whole calendar days ending on `endDay` (TikTok's latest day with data, or today) and the
 * same number of days just before them: never overlapping, never longer than asked.
 */
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

/** Change of a percentage, in percentage points. */
export function pointsChange(current, previous) {
  if (current == null || previous == null) return null
  return round1(current - previous)
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** Period totals; visitors and conversion average only the days TikTok has traffic for. */
export function totals(days) {
  const list = days || []
  const gmv = round2(list.reduce((s, d) => s + (d.gmv || 0), 0))
  const orders = list.reduce((s, d) => s + (d.orders || 0), 0)
  const refundDays = list.filter((d) => d.refunds != null)
  const visitors = mean(list.map((d) => num(d.visitors)).filter((v) => v != null))
  const conversion = mean(list.map((d) => num(d.conversion)).filter((v) => v != null))
  return {
    gmv,
    orders,
    avgOrder: orders ? round2(gmv / orders) : 0,
    refunds: refundDays.length ? round2(refundDays.reduce((s, d) => s + d.refunds, 0)) : null,
    visitorsPerDay: visitors == null ? null : Math.round(visitors),
    conversion: conversion == null ? null : round1(conversion * 100),
  }
}

const CHANNELS = [['video', 'Video'], ['live', 'LIVE'], ['productCard', 'Product card']]

/** Where GMV came from, largest first; null when TikTok shared no channel split. */
export function channelShare(days) {
  const sums = Object.fromEntries(CHANNELS.map(([k]) => [k, 0]))
  for (const d of days || []) for (const [k] of CHANNELS) sums[k] += d.channels?.[k] || 0
  const total = Object.values(sums).reduce((a, b) => a + b, 0)
  if (!total) return null
  return CHANNELS
    .map(([key, label]) => ({ key, label, amount: round2(sums[key]), share: round1((sums[key] / total) * 100) }))
    .sort((a, b) => b.amount - a.amount)
}

/** One row per day of the current period with the previous period's GMV on the same day index. */
export function withPrevious(current, previous, days, currentFrom) {
  const n = Number(days)
  const start = toDay(currentFrom)
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
    rows.push({ date: dayKey(d), gmv: now.get(dayKey(d))?.gmv || 0, prevGmv: before.get(dayKey(p))?.gmv || 0 })
  }
  return rows
}

/** Page views and visitors by day, only days TikTok has traffic for. */
export function trafficRows(days) {
  return (days || []).filter((d) => d.visitors != null || d.pageViews != null).map((d) => ({ date: d.date, pageViews: d.pageViews || 0, visitors: d.visitors || 0 }))
}

const BAD = /\bnot\b|n't|below|poor|risk|improve|fail|bad|warn|needs|low/i
const GOOD = /excellent|good|great|on.?track|meet|pass|healthy|normal/i

/** TikTok doesn't document its status values: bad words win, good ones pass, anything else needs a look. */
export function needsWork(status, code = '') {
  const said = `${status || ''} ${code || ''}`.trim()
  if (!said) return false
  if (BAD.test(said)) return true
  return !GOOD.test(said)
}

/** Shop Performance Score, benefits and the metrics that need work, from the analytics section loader. */
export function healthView(section) {
  const tiles = section?.summary || []
  const tile = (id) => tiles.find((t) => t.id === id)
  const table = (section?.tables || []).find((t) => t.id === 'health')
  const problems = (table?.rows || []).filter((r) => needsWork(r.status, r.statusCode))
  return {
    score: tile('sps-score')?.value ?? null,
    tier: tile('sps-score')?.sub || '',
    peers: tile('peers')?.value ?? null,
    benefits: tile('benefits')?.value ?? null,
    problems,
    allGood: Boolean(table) && !table.error && problems.length === 0,
    error: table?.error || '',
  }
}
