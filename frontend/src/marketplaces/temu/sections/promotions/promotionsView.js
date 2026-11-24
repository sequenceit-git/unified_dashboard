/** What the Temu Promotions page shows: open to join, joined and ended activities, and when they end. */

const table = (section, id) => (section?.tables || []).find((t) => t.id === id)
const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const ended = (a, now) => (a.ends && new Date(a.ends) < now) || /ended|finished|expired|closed/i.test(String(a.status || ''))

/** Joined (still running), open to join (not joined, not ended; canEnrol when Temu allows goods), ended. */
export function splitActivities(section, now = new Date()) {
  const joinedRows = table(section, 'joined')?.rows || []
  const available = table(section, 'available')?.rows || []
  const joinedIds = new Set(joinedRows.map((a) => a.id))
  const byId = new Map()
  for (const a of [...joinedRows, ...available]) if (!byId.has(a.id)) byId.set(a.id, a)
  const all = [...byId.values()].map((a) => {
    const actions = available.find((x) => x.id === a.id)?.actions || a.actions || []
    return { ...a, actions, checked: Boolean(a.checked || available.find((x) => x.id === a.id)?.checked), isJoined: joinedIds.has(a.id) || a.joined === 'Yes', canEnrol: actions.some((x) => x.id === 'enrol') }
  })
  return {
    open: all.filter((a) => !a.isJoined && !ended(a, now)),
    joined: all.filter((a) => a.isJoined && !ended(a, now)),
    ended: all.filter((a) => ended(a, now)),
    // Tables Temu didn't load: their counts are unknown, not 0.
    failed: { joined: Boolean(table(section, 'joined')?.error), available: Boolean(table(section, 'available')?.error) },
  }
}

export function endsText(a, now = new Date()) {
  if (!a?.ends) return ''
  const end = new Date(a.ends)
  if (end < now) return 'ended'
  const days = Math.round((day(end) - day(now)) / 86400000)
  return days <= 0 ? 'ends today' : `ends in ${days} day${days === 1 ? '' : 's'}`
}
