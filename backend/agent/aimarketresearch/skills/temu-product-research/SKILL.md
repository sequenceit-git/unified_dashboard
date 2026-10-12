---
name: temu-product-research
description: Research Temu listings, pricing, variations, reviews, and competing offers where accessible.
---

# Temu Product Research

## Purpose
Collect publicly accessible Temu product data for `MarketplaceResearch`
records (`marketplace: "temu"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search Temu product/search pages (they are JS-rendered; use `dynamic-page-extraction`).
2. Extract: title, URL, price + currency, "sold" counters if displayed, rating/review
   count, variation options (color/size), competing offers for near-identical items.
3. "Sold" counters on Temu are promotional and unverified — default to
   `salesDataType: "estimated"` with method, or `unavailable`.

## Output (per product, JSON)
Same `MarketplaceResearch` shape with `marketplace: "temu"`, including
`sourceUrl` and `dataCollectedAt`.

## Rules
- Never present Temu "sold" badges as actual sales volume.
- Group near-identical competing offers; dedupe per `research-deduplication`.
- Apply `source-validation` and `research-freshness`.
