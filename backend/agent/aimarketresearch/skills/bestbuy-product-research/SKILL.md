---
name: bestbuy-product-research
description: Search Best Buy products and collect pricing, specifications, ratings, reviews, and availability.
---

# Best Buy Product Research

## Purpose
Collect publicly accessible Best Buy product data (strong for electronics specs and
MSRP anchoring) for `MarketplaceResearch` records (`marketplace: "bestbuy"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search Best Buy search/product pages; capture key specifications for electronics.
2. Extract: title, SKU/URL, price + currency, open-box options if shown, rating,
   review count, availability (pickup/shipping), marketplace-seller flags.
3. No sales volume is exposed — `salesDataType: "unavailable"` by default.

## Output (per product, JSON)
Same `MarketplaceResearch` shape with `marketplace: "bestbuy"`, plus key specs
folded into review/notes context, `sourceUrl`, `dataCollectedAt`.

## Rules
- Use open-box pricing only as a price-floor signal, not the reference price.
- Apply `source-validation`, `research-deduplication`, `research-freshness`.
