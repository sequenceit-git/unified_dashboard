---
name: walmart-product-research
description: Search Walmart listings and collect product details, pricing, ratings, reviews, and availability.
---

# Walmart Product Research

## Purpose
Collect publicly accessible Walmart product data as a pricing/availability benchmark
for `MarketplaceResearch` records (`marketplace: "walmart"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search Walmart search/product pages (JS-rendered; use `dynamic-page-extraction`).
2. Extract: title, URL, price + currency, rating, review count, seller (Walmart vs
   marketplace), stock/availability status, rollback/clearance flags.
3. Walmart exposes no sales volume — `salesDataType` is `unavailable` unless a
   documented review-velocity method justifies `estimated`.

## Output (per product, JSON)
Same `MarketplaceResearch` shape with `marketplace: "walmart"`, including
`sourceUrl` and `dataCollectedAt`.

## Rules
- Distinguish Walmart-sold from marketplace-sold offers (different fulfillment/cost basis).
- Apply `source-validation`, `research-deduplication`, `research-freshness`.
