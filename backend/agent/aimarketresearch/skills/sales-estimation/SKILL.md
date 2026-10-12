---
name: sales-estimation
description: Estimate sales only when supporting evidence exists, documenting methodology, confidence, and limitations.
---

# Sales Estimation

## Purpose
Produce `estimatedMonthlySales` (+ `estimatedMonthlyRevenue`) with a documented
methodology — or decline and mark `unavailable`.

## Allowed methods (in order of strength)
1. Observed sold-count deltas over a known window (e.g., eBay sold history).
2. Review-velocity model: monthly new reviews × category review-rate factor
   (state the factor + its source).
3. Rank-based inference from a published rank→sales table (cite table + date).

## Steps
1. Pick the strongest applicable method; compute the point estimate.
2. State confidence (High/Medium/Low) + limitations in one line.
3. Set `salesDataType`: `actual` for method 1, `estimated` for 2–3, else `unavailable`
   with `estimatedMonthlySales: null`.

## Rules
- No method → no number. "Vibes" estimates are forbidden.
- Revenue = sales × observed price; show the multiplication.
