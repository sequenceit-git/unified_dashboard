---
name: opportunity-scoring-rubric
description: Calculate an explainable 0-100 Opportunity Score based on profit margin, demand strength, and review quality.
---

# Opportunity Scoring Rubric

## Purpose
Assign an auditable `opportunityScore` (between 0 and 100) to each product candidate.

## Scoring Rubric (Weights sum to 100)
1. **Profit Margin (40 points)**:
   - Margin ≥ 50%: 40 points
   - Margin 30%–49%: 30 points
   - Margin 15%–29%: 15 points
   - Margin < 15%: 0 points (unprofitable)
2. **Demand & Sales Velocity (35 points)**:
   - High velocity (≥1,000 units/mo or top seller badge): 35 points
   - Medium velocity (300–999 units/mo): 25 points
   - Low velocity (<300 units/mo): 10 points
3. **Rating & Customer Sentiment (25 points)**:
   - Rating ≥ 4.5 and low defect rate: 25 points
   - Rating 4.0–4.4 with minor solvable complaints: 18 points
   - Rating < 4.0: 5 points

## Final Calculation
- `opportunityScore = MarginScore + DemandScore + RatingScore` (clamped 10 to 99).
- Synthesize a concise 1-2 sentence `aiNotes` rationale explaining why this product is worth buying and selling.
