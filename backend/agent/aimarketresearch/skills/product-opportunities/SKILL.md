---
name: product-opportunities
description: Evaluate candidate products and interpret opportunity scores for recommendations.
---

# Product Opportunities

## Purpose
Turn scored candidates into the `opportunities[]` section of `MarketAnalysis` with
human-readable reasoning per product.

## Inputs
- Candidates with sub-scores from `product-scoring`, margin data, trend context.

## Steps
1. For each top candidate, write `reason` (2–4 sentences: why it wins on
   demand/competition/profit/trend balance) + supporting `sourceUrls`.
2. Carry sub-scores (`demandScore`, `competitionScore`, `profitabilityScore`,
   `trendScore`, `opportunityScore`) unchanged from `product-scoring`.
3. Rank by `opportunityScore` desc; cut below 50 unless the run has < 3 candidates.

## Output
`opportunities[]` entries for `MarketAnalysis` (see `structured-research-output`).

## Rules
- Reasons must cite specific evidence (prices, review counts, margins) — no generic
  "high demand, low competition" without numbers.
- Flag when a high score rests on `estimated`/`unavailable` data.
