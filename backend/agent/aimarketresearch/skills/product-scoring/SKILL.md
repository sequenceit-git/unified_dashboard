---
name: product-scoring
description: Apply a consistent, explainable scoring rubric across demand, competition, profitability, trend strength, and risk.
---

# Product Scoring

## Purpose
Single rubric producing `opportunityScore` (0–100) + sub-scores, replacing ad-hoc
math with auditable weights.

## Rubric (weights sum to 100)
- Demand (30): review mass + rating + sales-evidence tier (`actual`=full, `estimated`=half, `unavailable`=quarter).
- Competition (25): inverted — few weak sellers score high; review moats penalize.
- Profitability (25): margin % scaled (≥50% → full, linear to 0 at ≤10%).
- Trend (20): Growing=full, Stable=0.6, Uncertain=0.4, Declining=0.15.

## Steps
1. Score each sub-dimension 0–100 with the evidence cited.
2. `opportunityScore = round(0.30*demand + 0.25*competition + 0.25*profitability + 0.20*trend)`, clamp 5–99.
3. Attach `stalenessPenalty` note when inputs are stale (`research-freshness`).

## Output (JSON per product)
`{ opportunityScore, demandScore, competitionScore, profitabilityScore, trendScore, scoringNotes }`

## Rules
- Show the arithmetic; a score without sub-scores is invalid.
- Scores are comparative within a run, not absolute predictions.
