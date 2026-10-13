---
name: profitability-and-margin-analysis
description: Landed-cost math, marketplace fee stacks, net margins, and profitability sensitivity scenarios.
---

# Profitability & Margin Analysis

## Purpose
Calculate landed unit economics, fee structures, and sensitivity analysis to produce:
1. `profitAnalysis[]` in `MarketAnalysis` (per-product economics with explicit assumptions and sensitivity notes).
2. `estimatedProfitMarginPercent` in `ProductRecommendation`.

## Cost Stack (Per Unit, USD)
`landed = productCost + inboundShipping + marketplaceFees + marketing + returnsReserve + other`

### Platform Fees & Benchmarks
- **Amazon**: Referral fee ~15% + FBA fulfillment fees (if applicable).
- **Walmart**: Referral fee ~8–15% based on category.
- **eBay**: Final value fee ~13–15%.
- **TikTok Shop**: Referral fee ~6–8%.
- **Temu / AliExpress**: Platform commission or consignment rate (~10–12%).
- **Returns Reserve**: Category default 3% (electronics/fragile 5%) unless evidence indicates otherwise.
- **Marketing / Ad Spend**: Default 8–10% of selling price for initial launch campaigns.

## Calculation Steps
1. **Gather Evidence**: Collect selling price (`price`) and landed-cost candidates from supplier research.
2. **Build Cost Stack**: Detail product cost, shipping, platform fees, marketing, and returns. Record assumptions explicitly.
3. **Compute Margins**:
   - `profitPerUnit = sellingPrice - landedCost`
   - `marginPercent = (profitPerUnit / sellingPrice) * 100`
4. **Sensitivity Scenarios**: Evaluate robustness under ±20% product cost variance and -10% selling price discount.

## Output (JSON Structure)
```json
{
  "productName": "Ergonomic Desk Mat",
  "estimatedSellingPrice": 29.99,
  "estimatedProductCost": 6.50,
  "estimatedShippingCost": 4.20,
  "estimatedFees": 4.50,
  "estimatedMarginPercent": 49.3,
  "assumptions": [
    "Supplier FOB price $6.50 at 500 units MOQ",
    "Air shipping $4.20/unit to US",
    "Amazon 15% referral fee ($4.50)"
  ],
  "sensitivityNotes": "Remains profitable (32% margin) if shipping increases 20% or price drops 10%."
}
```

## Rules
- Unknown costs must be explicit `null` with clarifying assumption notes—never use hidden zeroes.
- Fee rates must explicitly state platform and category assumptions.
