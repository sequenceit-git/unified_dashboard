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
 * Compute 0-100 Opportunity Score
 * Rubric based on opportunity-scoring-rubric/SKILL.md:
 * - Net profit margin: max 35 (>=40%: 35, 30-39%: 28, 20-29%: 18, 15-19%: 10)
 * - Demand: max 25 (High: 25, Medium: 15, Low: 5, Unknown: 0)
 * - Rating & sentiment: max 15 (>=4.5 & no defect: 15; 4.0-4.4: 10; <4.0 or high defect: 3)
 * - Competition: max 15 (Low active listings / high room: 15; moderate: 8; crowded: 2)
 * - Sourcing reliability: max 10 (US or manufacturer <= 10d: 10; overseas 10-25d: 5; slow/retail: 0)
 */
function computeOpportunityScore({
  netMarginPct,
  demandTier,
  rating,
  highDefectRisk,
  competitionLevel,
  supplierType,
  shipFromCountry,
  estimatedDeliveryDays,
}) {
  let score = 0
  let missingRequired = 0

  // Margin Points (35)
  if (netMarginPct != null) {
    if (netMarginPct >= 40) score += 35
    else if (netMarginPct >= 30) score += 28
    else if (netMarginPct >= 20) score += 18
    else if (netMarginPct >= 15) score += 10
  } else {
    missingRequired++
  }

  // Demand Points (25)
  const dt = (demandTier || '').toLowerCase()
  if (dt === 'high') score += 25
  else if (dt === 'medium') score += 15
  else if (dt === 'low') score += 5
  else missingRequired++

  // Rating & Sentiment (15)
  const r = Number(rating)
  if (!isNaN(r) && r > 0) {
    if (r >= 4.5 && !highDefectRisk) score += 15
    else if (r >= 4.0 && !highDefectRisk) score += 10
    else score += 3
  } else {
    score += 5
  }

  // Competition (15)
  const comp = (competitionLevel || '').toLowerCase()
  if (comp === 'low') score += 15
  else if (comp === 'medium') score += 8
  else score += 2

  // Sourcing reliability (10)
  const isUS = (shipFromCountry || '').toUpperCase() === 'US'
  const isMfr = (supplierType || '').toLowerCase().includes('wholesale') || (supplierType || '').toLowerCase().includes('manufacturer')
  const days = Number(estimatedDeliveryDays) || 20

  if ((isUS || isMfr) && days <= 10) score += 10
  else if (days <= 25) score += 5
  else score += 2

  // Confidence & cap
  let confidence = 'high'
  if (missingRequired >= 2) {
    confidence = 'low'
    score = Math.min(score, 50)
  } else if (missingRequired === 1) {
    confidence = 'medium'
    score = Math.min(score, 65)
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
