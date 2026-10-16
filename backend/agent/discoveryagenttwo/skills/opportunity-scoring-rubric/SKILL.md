---
name: opportunity-scoring-rubric
description: Score one product 0-100 from verified fields and write short factual notes; scoring is computed by backend code.
---

# Opportunity Scoring Rubric

## Who does what

The backend computes the score from structured fields. The model only writes `aiNotes`.

## Gates (applied first, not scored)

- restrictedFlag true -> exclude
- netMarginPct below the minimum (default 20%) -> mark "unprofitable", exclude from top list
- matchConfidence = similar or no eBay evidence -> mark "unverified"

## Weights (sum 100)

- Net profit margin: 35 (>=40%: 35, 30-39%: 28, 20-29%: 18)
- Demand: 25 (High 25, Medium 15, Low 5, Unknown 0)
- Rating and sentiment: 15 (rating >=4.5 and no defect risk: 15; 4.0-4.4: 10; <4.0 or highDefectRisk: 3)
- Competition on eBay: 15 (few active listings and price room: 15; moderate: 8; crowded or price-war: 2)
- Sourcing reliability: 10 (US or manufacturer source with delivery <= 10 days: 10; overseas with 10-25 days: 5; slow or retail-only: 0)

## Confidence

Count required fields that are null. Cap the score at 60 if any of price, margin, or demand is missing, and set confidence = low | medium | high. Do not clamp to a minimum.

## aiNotes (1-2 sentences)

- Use only fields already extracted. No new facts.
- State the single strongest reason to buy and the single biggest risk.
