---
name: market-analysis
description: Explain demand indicators, market trends, and competitive conditions for the MarketAnalysis record.
---

# Market Analysis

## Purpose
Produce the `marketOverview`, `trends`, and `conclusion` sections of `MarketAnalysis`
from validated research records — narrative grounded in cited evidence.

## Inputs
- Validated `MarketplaceResearch[]`, category context, `competitor-analysis` output.

## Steps
1. Summarize demand: review-count mass, rating distribution, rank presence, sales
   evidence tier (`actual` > `estimated` > `unavailable`) — set `demandLevel`.
2. Summarize competition: seller count, price clustering, review moats — set
   `competitionLevel` and `marketOutlook` (1–2 sentences).
3. Write `trends[]` (name, direction Growing/Stable/Declining/Uncertain, evidence,
   sourceUrls, confidence) and `conclusion` (go / caution / avoid + why).

## Output
`MarketAnalysis`-shaped `{ marketOverview, trends[], risks[], conclusion }`
(see `structured-research-output`).

## Rules
- Every trend needs evidence + source URLs; a trend without evidence is Uncertain.
- Match the agreement disclaimer: analysis supports decisions, never guarantees outcomes.
