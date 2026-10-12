---
name: cost-and-margin-analysis
description: Account for product cost, shipping, marketplace fees, advertising, returns, and other relevant costs.
---

# Cost & Margin Analysis

## Purpose
Standard landed-cost + fee math feeding `profitability-analysis` and `product-scoring`.

## Cost stack (per unit, USD)
`landed = productCost + inboundShipping + marketplaceFees + marketing + returnsReserve + other`
- Marketplace fees: eBay ~13%, TikTok Shop ~8–10%, Temu — referral-style/consignment
  (state assumption; Temu pricing is platform-driven).
- Returns reserve: category default 3% (electronics 5%) unless evidence says otherwise.
- Marketing: default 8% of price unless a launch plan states otherwise.

## Steps
1. Fill each line with value + source; `null` + note when unknown.
2. `margin = (price − landed) / price`; cross-check against `marketAnalyzer.calculateMargin` scale.
3. Run sensitivity (±20% cost, −10% price) per `profitability-analysis`.

## Output (JSON)
`{ price, currency, costs: { product, shipping, fees, marketing, returns, other }, landed, profitPerUnit, marginPercent, assumptions[] }`

## Rules
- Fee rates are dated assumptions (Oct 2026) — re-verify when marketplaces change terms.
- Never bury unknowns in "other" without a note.
