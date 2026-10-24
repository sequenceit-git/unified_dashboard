/**
 * Agent memory: evidence records from runs that finished in the last 24 hours (master gate G2).
 * A remembered product is reused with its original observedAt instead of being searched again.
 */

const ResearchReport = require('../../models/ResearchReport')
const { listingKey } = require('./usListings')

const MEMORY_HOURS = 24

function titleKey(title) {
  const words = String(title || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  return words.length >= 3 ? words.slice(0, 8).join(' ') : null
}

/** Listing keys and the title key that identify one candidate or opportunity (gate G4). */
function identityKeys(item) {
  const urls = [item?.listingUrl, ...(Array.isArray(item?.sources) ? item.sources.map((source) => source?.url) : [])]
  const keys = urls.map(listingKey).filter(Boolean)
  const byTitle = titleKey(item?.title)
  if (byTitle) keys.push(`title:${byTitle}`)
  return [...new Set(keys)]
}

/** Drops candidates that point at a product already in the list. */
function dedupeCandidates(candidates) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    const keys = identityKeys(candidate)
    if (keys.some((key) => seen.has(key))) return false
    keys.forEach((key) => seen.add(key))
    return true
  })
}

async function loadEvidenceMemory({ excludeReportId, hours = MEMORY_HOURS } = {}) {
  const since = new Date(Date.now() - hours * 3600000)
  const reports = await ResearchReport.find({
    _id: { $ne: excludeReportId },
    status: { $in: ['completed', 'stopped'] },
    updatedAt: { $gte: since },
  })
    .sort({ updatedAt: -1 })
    .select('opportunities')
    .lean()

  const byKey = new Map()
  for (const report of reports) {
    for (const opp of report.opportunities || []) {
      if (!opp.linksVerified || !opp.evidenceTier || !opp.observedAt || new Date(opp.observedAt) < since) continue
      const { rank, addedProductId, listedShops, ...evidence } = opp
      for (const key of identityKeys(opp)) {
        if (!byKey.has(key)) byKey.set(key, { ...evidence, reusedFromReport: report._id })
      }
    }
  }

  return {
    size: new Set(byKey.values()).size,
    recall(candidate) {
      for (const key of identityKeys(candidate)) {
        if (byKey.has(key)) return byKey.get(key)
      }
      return null
    },
  }
}

module.exports = {
  identityKeys,
  dedupeCandidates,
  loadEvidenceMemory,
}
