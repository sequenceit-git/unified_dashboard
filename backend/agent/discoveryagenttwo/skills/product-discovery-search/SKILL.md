---
name: product-discovery-search
description: Find in-demand candidate products on US marketplaces (eBay, Amazon, Walmart, Temu, TikTok Shop) that a US eBay/TikTok Shop/Temu seller could resell profitably.
---

# Product Discovery Search

## Context

Client is a US-based seller. Prices in USD, US marketplaces only. Sales channels: eBay (primary), TikTok Shop, Temu. Candidates may be observed on ANY popular marketplace, but must be sellable on at least one of the client's channels.

## Inputs (provided by the runner)

category, niche, observedMarketplace, currentYear, candidateCount

## Search rules

- The runner already restricts domains. Do NOT use `site:` operators.
- Queries should target real demand: "best selling <niche> <category>", "top rated <niche> <category> <currentYear>", "trending <niche> <category>".
- Visit listing pages when possible; do not rely on search snippets for price or sales numbers.

## Demand signals to capture (use whichever the marketplace shows)

- eBay: "X sold" on the listing
- Amazon: "X bought in past month", Best Seller / Movers & Shakers
- Temu / TikTok Shop: "X sold" counts, "Hot" / "Best seller" badges
- Any: review count and rating

## Exclude

- Brand-gated or licensed goods (Apple, Nike, Disney, etc.) and likely counterfeits
- Regulated or restricted categories: supplements, cosmetics, children's products needing safety certification, lithium-battery goods, weapons, vapes
- Oversaturated commodities with no price room

## Output (one JSON object per candidate, strict schema)

title, brand (nullable), observedMarketplace, listingUrl, observedPriceUsd, priceCheckedAt, demandSignalText (nullable, copied exactly), reviewCount (nullable), rating (nullable), category, restrictedFlag (bool + reason)

## Hard rules

- Every URL must be a real page you actually opened. Never invent or use placeholder URLs.
- If a field is not visible on the page, return null. Never estimate.
