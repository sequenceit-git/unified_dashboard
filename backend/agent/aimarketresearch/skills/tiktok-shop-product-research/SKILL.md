---
name: tiktok-shop-product-research
description: Research TikTok Shop products, visible popularity indicators, pricing, reviews, and trends where accessible.
---

# TikTok Shop Product Research

## Purpose
Collect publicly accessible TikTok Shop product data for `MarketplaceResearch`
records (`marketplace: "tiktok_shop"`).

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 10)

## Steps
1. Search TikTok Shop storefront/product pages and web search (`site:tiktok.com` shop URLs).
2. Extract: title, URL, price + currency, units-sold text if displayed, rating/review
   count, shop name/follower signals, promotions/coupons.
3. Treat "sold" counters as observed-but-unverifiable unless methodology is known —
   prefer `salesDataType: "estimated"` with method note, or `unavailable`.

## Output (per product, JSON)
Same `MarketplaceResearch` shape with `marketplace: "tiktok_shop"`, including
`sourceUrl` and `dataCollectedAt`.

## Rules
- TikTok Shop pages are JS-heavy — use `dynamic-page-extraction`.
- Do not extrapolate follower counts into sales figures.
- Apply `source-validation`, `research-deduplication`, `research-freshness`.
