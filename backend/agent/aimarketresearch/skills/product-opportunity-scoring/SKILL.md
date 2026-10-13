---
name: product-opportunity-scoring
description: Multi-factor scoring rubric (0-100) and opportunity prioritization for product recommendations.
---

# Product Opportunity Scoring

## Purpose
Apply an auditable, multi-factor scoring rubric (0–100) across candidate products to generate:
1. `opportunityScore` and `recommendationReason` in `ProductRecommendation`.
2. `opportunities[]` with sub-scores in `MarketAnalysis`.

## Scoring Rubric (Weights sum to 100)
- **Demand (30%)**: Verified review volume, rating momentum, and sales velocity (`actual` = full weight, `estimated` = partial, `unavailable` = baseline).
- **Competition (25%)**: Inverted competition scale — markets dominated by few weak sellers score high (80–100); markets with monolithic review moats (thousands of reviews) receive low scores (10–30).
- **Profitability (25%)**: Scaled net margin percentage:
  - Margins ≥ 50% = 100 points
  - Margins 30–49% = 70–90 points
  - Margins 15–29% = 40–60 points
  - Margins < 15% = 0–20 points
- **Trend Strength (20%)**: Market momentum classification:
  - `Growing` = 100 points
  - `Stable` = 65 points
  - `Uncertain` = 40 points
  - `Declining` = 15 points

## Steps
1. **Sub-score Assignment**: Calculate `demandScore`, `competitionScore`, `profitabilityScore`, and `trendScore` (each 0–100).
2. **Composite Calculation**:
   `opportunityScore = Math.round(0.30 * demand + 0.25 * competition + 0.25 * profitability + 0.20 * trend)`
   - Clamp final score between 5 and 99.
3. **Draft Justification**: Write a crisp 2–4 sentence recommendation reasoning highlighting the balance of high demand, manageable competition, and target profit margin.
4. **Ranking**: Sort candidates descending by `opportunityScore` (Rank 1 = highest opportunity).

## Output (JSON Structure)
```json
{
  "productName": "Cordless Handheld Vacuum",
  "opportunityScore": 84,
  "subScores": {
    "demandScore": 88,
    "competitionScore": 75,
    "profitabilityScore": 86,
    "trendScore": 85
  },
  "recommendationReason": "High search volume with over 3,000 monthly units across top listings. Incumbents suffer from poor battery life reviews (average 3.8 stars), providing a clear entry opportunity with a 48% estimated margin.",
  "targetMargin": 48.5
}
```

## Rules
- Every opportunity score must be backed by concrete numbers (prices, review counts, margins).
- Avoid vague generic praises ("great product, high potential") without quantitative backing.
