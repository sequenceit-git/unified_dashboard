/**
 * Market Research & Intelligence Analyzer
 * Evaluates marketplace signals, estimated margins, competition, and opportunity scores
 */

class MarketAnalyzer {
  /**
   * Calculates estimated profit margin percentage
   * @param {number} sellingPrice 
   * @param {number} estimatedCost 
   * @param {number} feeRate (e.g. 0.12 for ~12% marketplace fee)
   */
  calculateMargin(sellingPrice, estimatedCost, feeRate = 0.13) {
    if (!sellingPrice || sellingPrice <= 0) return 0
    const netRevenue = sellingPrice * (1 - feeRate)
    const profit = netRevenue - (estimatedCost || sellingPrice * 0.4)
    return Math.max(0, Math.min(95, Math.round((profit / sellingPrice) * 100)))
  }

  /**
   * Calculates overall Opportunity Score (0 - 100)
   * Formula factors in:
   *  - Profit margin (35%)
   *  - Demand / monthly sales velocity (30%)
   *  - Competition ratio (20%)
   *  - Review rating satisfaction (15%)
   */
  calculateOpportunityScore({ margin, monthlySales, competitorCount, rating }) {
    // 1. Margin score (target >= 45% margin)
    const marginScore = Math.min(100, (margin / 50) * 100) * 0.35

    // 2. Demand score (target 300 - 2,500 units/mo)
    const salesVolume = Number(monthlySales) || 500
    const demandScore = Math.min(100, (salesVolume / 1500) * 100) * 0.30

    // 3. Competition score (fewer competitors = higher score)
    const competitors = Number(competitorCount) || 20
    const compScore = Math.max(10, 100 - (competitors * 1.8)) * 0.20

    // 4. Rating score (4.2 - 4.7 is sweet spot: high demand with room for improvement)
    const rate = Number(rating) || 4.4
    const ratingScore = (rate >= 4.0 ? Math.min(100, rate * 20) : 50) * 0.15

    const total = Math.round(marginScore + demandScore + compScore + ratingScore)
    return Math.max(15, Math.min(99, total))
  }

  /**
   * Generates AI strategic insight notes for an opportunity
   */
  generateAiInsight({ title, marketplace, margin, score, competitorCount, monthlySales }) {
    const marketLabel = 'eBay'
    
    if (score >= 85) {
      return `High potential winner on ${marketLabel}. Strong demand velocity (~${monthlySales} units/mo) with exceptional ${margin}% margin. Low-to-moderate competition (${competitorCount} sellers). Recommended for immediate catalog addition.`
    }
    if (score >= 70) {
      return `Solid growth candidate on ${marketLabel}. Healthy ${margin}% margin and steady sales momentum. Optimize listing images and bundle accessories to outperform competing offerings.`
    }
    return `Niche opportunity on ${marketLabel}. ${margin}% margin. Consider private labeling or promotional discounts to gain search ranking traction.`
  }
}

module.exports = new MarketAnalyzer()
