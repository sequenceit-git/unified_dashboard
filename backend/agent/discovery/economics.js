/**
 * Best-seller scoring from the master skill (marketplace-best-seller-research, sections 3 and 8).
 * Rank by evidence tier first, then by the documented 0-100 score.
 */

const WEIGHTS = {
  sales: 45,
  velocity: 20,
  reviews: 15,
  freshness: 10,
  corroboration: 10,
}

const TIER_ORDER = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 }

const OFFICIAL_RANK = /best\s?seller|#\s?\d[\d,]*\s+in\b|movers\s*(?:&|and)\s*shakers|top\s?rated|trending\s+#?\d/i
const SOLD_WORDING = /\bsold\b|bought in (?:the )?past/i

/** Reads "12.4k sold", "2K+ bought in past month", "1,203 sold" as a floor number. */
function parseCount(text) {
  const match = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km])?\+?\s*(?:sold|bought)/i)
  if (!match) return null
  const unit = (match[2] || '').toLowerCase()
  const factor = unit === 'k' ? 1000 : unit === 'm' ? 1000000 : 1
  return Math.round(Number(match[1]) * factor)
}

function parseRank(text) {
  const match = String(text || '').replace(/,/g, '').match(/#\s?(\d+)/)
  return match ? Number(match[1]) : null
}

/** The strongest tier the observed fields actually support. T1 needs the seller's own order data. */
function evidenceTierOf({ ownSales, officialRank, demandSignal, soldCount, rating, reviewCount }) {
  if (Number(ownSales) > 0) return 'T1'
  if (String(officialRank || '').trim() || OFFICIAL_RANK.test(String(demandSignal || ''))) return 'T2'
  if (Number(soldCount) > 0 || SOLD_WORDING.test(String(demandSignal || ''))) return 'T3'
  if (Number(rating) > 0 || Number(reviewCount) > 0) return 'T4'
  return 'T5'
}

function salesFraction({ tier, officialRank, demandSignal, soldCount }) {
  if (tier === 'T1') return 1
  let best = null
  if (tier === 'T2') {
    const rank = parseRank(officialRank) ?? parseRank(demandSignal)
    best = rank == null ? 0.8 : rank <= 10 ? 1 : rank <= 100 ? 0.85 : 0.7
  }
  const sold = Number(soldCount) > 0 ? Number(soldCount) : parseCount(demandSignal)
  if (sold != null) {
    const fromSold = sold >= 10000 ? 1 : sold >= 1000 ? 0.85 : sold >= 100 ? 0.6 : 0.4
    best = Math.max(best ?? 0, fromSold)
  } else if (tier === 'T3') {
    best = Math.max(best ?? 0, 0.5)
  }
  return best
}

function velocityFraction(velocity) {
  const value = String(velocity || '').toLowerCase()
  if (value === 'rising') return 1
  if (value === 'steady') return 0.7
  if (value === 'spike') return 0.3
  return null
}

function reviewFraction(rating, reviewCount) {
  const stars = Number(rating)
  if (!(stars > 0)) return null
  const quality = stars >= 4.5 ? 1 : stars >= 4.0 ? 0.7 : stars >= 3.5 ? 0.4 : 0.15
  const count = Number(reviewCount)
  const volume = count >= 1000 ? 1 : count >= 100 ? 0.85 : count >= 10 ? 0.6 : 0.5
  return quality * volume
}

/**
 * Returns the tier, the 0-100 score (null when fewer than two components were observed),
 * confidence per the master rubric, a one-line reason, and the weights and penalties used.
 */
function computeOpportunityScore({
  ownSales = null,
  officialRank = null,
  demandSignal = '',
  soldCount = null,
  metricScope = 'unknown',
  velocity = null,
  rating = null,
  reviewCount = null,
  verifiedPlaces = 0,
  independentSignal = false,
  manipulationFlags = [],
}) {
  const tier = evidenceTierOf({ ownSales, officialRank, demandSignal, soldCount, rating, reviewCount })
  const places = Number(verifiedPlaces) || 0
  const corroborated = places >= 2 || Boolean(independentSignal)
  const flags = Array.isArray(manipulationFlags) ? manipulationFlags.filter(Boolean) : []
  const scope = String(metricScope || 'unknown').toLowerCase()
  const metricUnclear = tier === 'T3' && !['lifetime', 'recent'].includes(scope)

  const parts = {
    sales: ['T1', 'T2', 'T3'].includes(tier) ? salesFraction({ tier, officialRank, demandSignal, soldCount }) : null,
    velocity: velocityFraction(velocity),
    reviews: reviewFraction(rating, reviewCount),
    freshness: places > 0 ? 1 : null,
    corroboration: places > 0 || independentSignal ? (places >= 3 ? 1 : corroborated ? 0.7 : 0.2) : null,
  }

  const used = Object.keys(parts).filter((key) => parts[key] != null)
  const weightSum = used.reduce((sum, key) => sum + WEIGHTS[key], 0)
  const weightsUsed = Object.fromEntries(used.map((key) => [key, Math.round((WEIGHTS[key] / weightSum) * 1000) / 10]))

  const penalties = []
  if (flags.length) penalties.push({ gate: 'G5', reason: 'Possible review or sales manipulation', points: 15 })
  if (metricUnclear) penalties.push({ gate: 'G3', reason: 'Sold figure period is not stated', points: 10 })

  let opportunityScore = null
  if (used.length >= 2) {
    const raw = used.reduce((sum, key) => sum + WEIGHTS[key] * parts[key], 0) / weightSum * 100
    const penalty = penalties.reduce((sum, item) => sum + item.points, 0)
    opportunityScore = Math.min(100, Math.max(0, Math.round(raw - penalty)))
  }

  let confidence = 'medium'
  let confidenceReason = ''
  if (tier === 'T4' || tier === 'T5') {
    confidence = 'low'
    confidenceReason = 'Only demand proxies such as reviews were observed, not sales or an official rank.'
  } else if (flags.length) {
    confidence = 'low'
    confidenceReason = `Flagged for possible manipulation: ${flags.join(', ')}.`
  } else if (metricUnclear) {
    confidence = 'low'
    confidenceReason = 'The sold figure does not state whether it is lifetime or recent.'
  } else if (!corroborated) {
    confidence = 'medium'
    confidenceReason = 'Single verified listing; no independent second signal was confirmed.'
  } else if (tier === 'T1' || tier === 'T2') {
    confidence = 'high'
    confidenceReason = `${tier === 'T1' ? 'Confirmed store sales' : 'Official platform rank or badge'} corroborated on ${places} verified US listing${places === 1 ? '' : 's'}.`
  } else {
    confidence = 'medium'
    confidenceReason = `Platform-displayed sold count corroborated on ${places} verified US listing${places === 1 ? '' : 's'}.`
  }

  return {
    evidenceTier: tier,
    opportunityScore,
    confidence,
    confidenceReason,
    scoreBreakdown: {
      weightsUsed,
      renormalized: used.length < Object.keys(WEIGHTS).length,
      penalties,
    },
  }
}

const shopCount = (opp) => new Set((opp.sources || []).map((source) => source.place)).size

/**
 * Tier first (T1 strongest), then score, then the number of US shops it is confirmed on.
 * Products without a score sort last within their tier.
 */
function compareByEvidence(a, b) {
  const tierGap = (TIER_ORDER[a.evidenceTier] || 9) - (TIER_ORDER[b.evidenceTier] || 9)
  if (tierGap) return tierGap
  const scoreGap = (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1)
  if (scoreGap) return scoreGap
  return shopCount(b) - shopCount(a)
}

module.exports = {
  computeOpportunityScore,
  compareByEvidence,
}
