---
name: ebay-product-research
description: Research eBay listings, sold/completed evidence where accessible, price ranges, and competition for a product or keyword.
---

# eBay Product Research

## Purpose
Collect publicly accessible eBay listing data to support `MarketplaceResearch` records
(`marketplace: "ebay"`) and downstream scoring.

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Build search queries per `web-search-strategy` (include `site:ebay.com` variants).
2. Open active listings; where accessible, check sold/completed listings as demand evidence.
3. Extract per listing: title, URL, price + currency, rating/review count if shown,
   seller type, shipping/returns terms, variations.
4. Record `salesDataType`: `actual` only with observed sold counts, else `estimated`
   (document method) or `unavailable`.

## Output (per product, JSON)
`{ productName, marketplace: "ebay", productUrl, price, currency, estimatedMonthlySales,
salesDataType, searchRanking, rankingKeyword, rating, reviewCount,
reviewSummary: { positive[], negative[] }, sourceUrl, dataCollectedAt }`

## Rules
- Never invent sold counts or search ranks. Sold/completed sections are often
  login-walled — mark `unavailable` rather than guessing.
- Deduplicate variants of the same listing per `research-deduplication`.
- Follow `source-validation` and `research-freshness` for every record.
