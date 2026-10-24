/**
 * Calculations for Landed Unit Economics & Scoring Rubric
 * Based on SKILL.md specs for Discovery Agent Two
 */

/**
 * Calculate Marketplace Net Margin
 * Reference fees:
 * - eBay: 13.6% referral fee + $0.30 fixed fee (or $0.40 if sellingPrice > 10)
 * - TikTok Shop: 8% referral fee + $0.30
 * - Default / other: 15% flat
 */
function calculateUnitEconomics({ sellingPrice, unitCost, shippingCost = 0, marketplace = 'ebay', dutyApplies = false }) {
  if (sellingPrice == null || unitCost == null || Number(sellingPrice) <= 0) {
    return {
      netProfit: null,
      netMarginPct: null,
      channelFee: null,
      dutyCost: null,
      landedCost: null,
      isViable: false,
    }
  }

  const price = Number(sellingPrice)
  const cost = Number(unitCost)
  const ship = Number(shippingCost) || 0

  // 1. Channel Fee calculation
  let fee = 0
  const market = (marketplace || '').toLowerCase()
  if (market.includes('ebay')) {
    const fixedFee = price > 10 ? 0.40 : 0.30
    fee = (price * 0.136) + fixedFee
  } else if (market.includes('tiktok')) {
    fee = (price * 0.08) + 0.30
  } else {
    fee = price * 0.15
  }

  // 2. Import Duty calculation if applicable (conservative 10% on cost if non-US)
  const dutyCost = dutyApplies ? (cost * 0.10) : 0

  // 3. Landed Cost
  const landedCost = cost + ship + dutyCost

  // 4. Net Profit & Margin
  const netProfit = price - landedCost - fee
  const netMarginPct = Math.round(((netProfit / price) * 100) * 10) / 10

  return {
    sellingPrice: price,
    unitCost: cost,
    shippingCost: ship,
    dutyCost: Math.round(dutyCost * 100) / 100,
    landedCost: Math.round(landedCost * 100) / 100,
    channelFee: Math.round(fee * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    netMarginPct,
    isViable: netMarginPct != null && !isNaN(netMarginPct),
  }
}

/**
 * Score 0-100 from best-seller evidence only: demand, sold volume, and rating.
 * Buy cost, margin, and supplier reliability are not part of the score.
 */
function computeOpportunityScore({
  demandTier,
  rating,
  soldCount,
  demandSignal,
  price,
  highDefectRisk,
}) {
  let score = 0
  let missingRequired = 0

  const dt = (demandTier || '').toLowerCase()
  if (dt === 'high') score += 40
  else if (dt === 'medium') score += 24
  else if (dt === 'low') score += 8
  else missingRequired++

  const stars = Number(rating)
  if (!isNaN(stars) && stars > 0) {
    if (stars >= 4.5) score += 30
    else if (stars >= 4.0) score += 20
    else score += 8
    if (highDefectRisk) score = Math.max(0, score - 8)
  } else {
    missingRequired++
  }

  const sold = Number(soldCount)
  if (!isNaN(sold) && sold > 0) {
    if (sold >= 1000) score += 30
    else if (sold >= 100) score += 22
    else score += 12
  } else if (String(demandSignal || '').trim()) {
    score += 15
  } else {
    missingRequired++
  }

  if (price == null || Number(price) <= 0) missingRequired++

  let confidence = 'high'
  if (missingRequired >= 2) {
    confidence = 'low'
    score = Math.min(score, 55)
  } else if (missingRequired === 1) {
    confidence = 'medium'
  }

  return {
    opportunityScore: Math.min(100, Math.max(0, Math.round(score))),
    confidence,
  }
}

module.exports = {
  calculateUnitEconomics,
  computeOpportunityScore,
}
