---
name: aliexpress-product-research
description: Find comparable AliExpress products and suppliers with unit prices, MOQ, shipping info, and variants.
---

# AliExpress Product Research

## Purpose
Find comparable/sourcing-side products for margin math (`cost-and-margin-analysis`)
and `MarketplaceResearch` records (`marketplace: "aliexpress"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search AliExpress for near-identical products (image/title comparison).
2. Extract: title, URL, unit price + currency, MOQ/price breaks, variants, shipping
   cost + delivery window to the US, seller ratings/tenure, "orders" counters
   (treat as `estimated` at best — commonly inflated).
3. Record the cheapest credible landed-cost candidate per product for margin modeling.

## Output (per product, JSON)
`MarketplaceResearch` shape with `marketplace: "aliexpress"` + sourcing extras:
`moq`, `shippingCost`, `deliveryWindow`, `sellerTenure`, `sourceUrl`, `dataCollectedAt`.

## Rules
- "Orders" counters are not verified sales — never `actual`.
- Flag copy-variant risk (same photos, different sellers) for `supplier-verification`.
- Apply `source-validation`, `research-deduplication`, `research-freshness`.
