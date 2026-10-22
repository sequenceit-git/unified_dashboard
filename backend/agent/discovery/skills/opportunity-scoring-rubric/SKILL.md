---
name: opportunity-scoring-rubric
description: Score one product 0-100 from verified fields and write short factual notes; scoring is computed by backend code.
---

# Opportunity Scoring Rubric

## Who does what

The backend computes the score from structured fields. The model only writes `aiNotes`.

## Gates (applied first, not scored)

- restrictedFlag true -> exclude
- matchConfidence = similar or no eBay evidence -> mark "unverified"

## Weights (sum 100)

Score only how well the product is already selling. Do not score margin, unit cost, or suppliers.

- Demand: 40 (High 40, Medium 24, Low 8, Unknown 0)
- Rating: 30 (>=4.5: 30; 4.0-4.4: 20; below 4.0: 8; subtract 8 when defect risk is high)
- Sold evidence: 30 (1,000+ sold: 30; 100+: 22; any sold count: 12; a visible best-seller or viral label with no count: 15)

## Confidence

Cap the score at 55 and set confidence to low when two or more of demand, rating, sold evidence, or price are missing.

## aiNotes (1-2 sentences)

- Use only fields already extracted. No new facts.
- Name the selling evidence: sold count or best-seller label, rating, demand, and the listed price.
- Do not mention profit, margin, unit cost, wholesale, or suppliers.
