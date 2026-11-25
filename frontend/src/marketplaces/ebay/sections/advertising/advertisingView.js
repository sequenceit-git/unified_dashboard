/**
 * What the eBay Promoted Listings page shows: campaigns by state, which loader actions belong to the
 * campaign's ads vs the campaign itself, and the New campaign steps' checks.
 */

const AD_ACTIONS = ['add-listings', 'set-rate', 'remove-listings']
const state = (raw) => (/RUNNING/i.test(raw) ? 'running' : /PAUSED/i.test(raw) ? 'paused' : /ENDED|DELETED/i.test(raw) ? 'ended' : 'scheduled')

const tableOf = (section, id) => (section?.tables || []).find((t) => t.id === id)

/** Campaigns with a state for the pills (null when eBay didn't load them). */
export function campaignRows(section) {
  const t = tableOf(section, 'campaigns')
  if (!t || t.error) return null
  return t.rows.map((r) => ({ ...r, state: state(r.rawStatus || r.status) }))
}

export function campaignPills(rows, reports) {
  const count = (s) => (rows ? rows.filter((r) => r.state === s).length : null)
  return [
    { key: 'running', label: 'Running', count: count('running') },
    { key: 'scheduled', label: 'Scheduled', count: count('scheduled') },
    { key: 'paused', label: 'Paused', count: count('paused') },
    { key: 'ended', label: 'Ended', count: count('ended') },
    { key: 'all', label: 'All campaigns', count: rows ? rows.length : null },
    { key: 'reports', label: 'Reports', count: reports ? reports.length : null },
  ].filter((p) => !['scheduled', 'paused'].includes(p.key) || p.count)
}

/** The loader's row actions split into the campaign's ads (add, rate, remove) and the campaign itself. */
export function splitActions(row) {
  const doable = (row?.actions || []).filter((a) => !a.detail)
  return {
    ads: doable.filter((a) => AD_ACTIONS.includes(a.id)),
    campaign: doable.filter((a) => !AD_ACTIONS.includes(a.id)),
    quick: doable.find((a) => a.id === 'pause' || a.id === 'resume') || null,
  }
}

/** The listings the New campaign form offers (the loader's create action), eBay's suggestions first. */
export function campaignListings(section) {
  const create = (tableOf(section, 'campaigns')?.actions || []).find((a) => a.id === 'create')
  return create?.input?.fields?.find((f) => f.name === 'listings')?.options || []
}

/** New campaign: what's still missing, per step. */
export function newCampaignProblems({ name, rate, start, end }) {
  const problems = []
  if (rate !== '' && rate != null) {
    const r = Number(rate)
    if (!Number.isFinite(r) || r < 2 || r > 100) problems.push({ step: 'rate', field: 'rate', message: "The ad rate is from 2% to 100% (or leave it empty for eBay's suggested rate)." })
  }
  if (start && end && new Date(end) <= new Date(start)) problems.push({ step: 'details', field: 'end', message: 'The end is after the start.' })
  if (!String(name || '').trim()) problems.push({ step: 'details', field: 'name', message: 'Give the campaign a name.' })
  return problems
}
