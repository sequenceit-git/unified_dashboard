---
name: product-discovery-search
description: Find best-selling and viral products on US marketplaces (eBay, Amazon, Walmart, Temu, TikTok Shop). Do not search for suppliers.
---

# Product Discovery Search

## Context

Client sells in the United States only. Prices in USD. Use only ebay.com, amazon.com, walmart.com, and temu.com product pages. Do not use other countries. Look only at live retail listings for products that are already selling well or going viral. Do not look for wholesale suppliers, factories, or buy-cost pages.

## Inputs (provided by the runner)

category, niche, observedMarketplace, currentYear, candidateCount

## Search rules

- The runner already restricts domains. Do NOT use `site:` operators.
- Queries should target products people are already buying: "best selling <niche> <category>", "viral <niche> <category> <currentYear>", "trending <niche> <category>", "movers and shakers <category>".
- Open the product listing. Copy the description, feature bullets, and visible specification rows (material, size, color, weight, power, compatibility, what is included). Do not rely on search snippets for price, sales numbers, or specs.

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

title, brand (nullable), observedMarketplace, listingUrl, observedPriceUsd, demandSignalText (copied exactly), reviewCount, rating, category, description (2-4 sentences from the listing), highlights (up to 5), specs (name/value pairs from the page), imageUrls (up to 4), restrictedFlag (bool + reason)

## Hard rules

- Every URL must be a real page you actually opened. Never invent or use placeholder URLs.
- If a field is not visible on the page, return null. Never estimate.
