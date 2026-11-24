/** What the Temu Ads page shows: needs attention, order and tone of ROAS, and "Ads not on". */

const val = (m) => (m && typeof m === 'object' ? Number(m.value) || 0 : Number(m) || 0)

export function adsAttention(rows) {
  if (!rows) return []
  const spent = rows.filter((r) => val(r.spend) > 0)
  const losing = spent.filter((r) => r.roas != null && Number(r.roas) < 1).length
  const noOrders = spent.filter((r) => !Number(r.orders)).length
  const items = []
  if (losing) items.push({ id: 'losing', text: `${losing} ad${losing === 1 ? '' : 's'} earn${losing === 1 ? 's' : ''} less than ${losing === 1 ? 'it spends' : 'they spend'} (ROAS under 1)`, action: 'Show' })
  if (noOrders) items.push({ id: 'noOrders', text: `${noOrders} ad${noOrders === 1 ? '' : 's'} spent with no orders in 30 days`, action: 'Show' })
  return items
}

export const bySpend = (rows) => [...(rows || [])].sort((a, b) => val(b.spend) - val(a.spend))

/** Under 1 loses money, 1–3 pays back, 3+ is strong. */
export function roasTone(roas) {
  if (roas == null || roas === '') return ''
  const n = Number(roas)
  return n < 1 ? 'bad' : n < 3 ? 'ok' : 'good'
}

/** The shop's Temu connection or account has no Ads (not a passing error). */
export function adsOff(table) {
  return Boolean(table?.error) && /does not allow|needs "[^"]*" enabled|not (?:open|enabled|authori[sz]ed)|no permission|permission denied|not opened|advertis\w* (?:is )?not/i.test(table.error)
}
