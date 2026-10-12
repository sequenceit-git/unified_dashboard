---
name: amazon-product-research
description: Search Amazon listings and extract title, URL, price, rating, review count, variations, and available sales indicators.
---

# Amazon Product Research

## Purpose
Collect publicly accessible Amazon product data as a cross-marketplace demand and
pricing benchmark for `MarketplaceResearch` records (`marketplace: "amazon"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search Amazon search/category pages and Best-Seller-Rank (BSR) badges where visible.
2. Extract: title, ASIN/URL, price + currency, rating, review count, variation count,
   BSR category + rank (as rank evidence, not sales), seller (Amazon vs 3P).
3. BSR may support an *estimated* sales inference only via a documented method —
   otherwise `salesDataType: "unavailable"`.

## Output (per product, JSON)
Same `MarketplaceResearch` shape with `marketplace: "amazon"`, including
`sourceUrl` and `dataCollectedAt`.

## Rules
- BSR rank goes in `searchRanking` + `rankingKeyword` (category); never convert to
  sales without a stated estimation method (`sales-estimation`).
- Apply `source-validation`, `research-deduplication`, `research-freshness`.
