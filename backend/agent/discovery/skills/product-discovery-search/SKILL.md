---
name: product-discovery-search
description: Stage 1 of marketplace-best-seller-research. Discover US best-seller candidates and capture an evidence record for each from pages actually opened.
---

# Product Discovery Search (Stage 1)

This stage carries out section 4 steps 1 to 4 of the master skill `marketplace-best-seller-research`. The master's evidence tiers, untrusted-content rule, and accuracy rules always apply. Nothing here overrides them.

## Scope (dashboard defaults, master section 12)

United States only, USD. Open only US product pages on ebay.com, amazon.com, walmart.com, temu.com, tiktok.com (TikTok Shop), etsy.com, and wish.com. No other countries or country paths, no suppliers, wholesale, factories, or buy-cost pages. The runner asks for up to 25 candidates per round and repeats until 20 products are confirmed; it lists products already reviewed so you can skip them.

## Inputs (provided by the runner)

category, niche, user preferences, currentYear, candidate count, products already reviewed

## Discover

- The runner restricts domains. Do not use `site:` operators.
- Start from official ranking surfaces first, because they are T2: Amazon Best Sellers and Movers & Shakers, Walmart best sellers, eBay trending, Temu "Best seller" badges. Then keyword searches such as "best selling <niche> <category>" or "trending <category> <currentYear>".
- Search each platform and each distinct keyword separately.
- Open the product page. Never take a price, sold count, rank, or spec from a search snippet.

## Evidence record per candidate (master section 5)

Copy exactly what the page shows; use null when it is not shown:

- demandSignalText: exact wording, e.g. "2K+ bought in past month", "12,400 sold", "#3 in Kitchen & Dining"
- officialRank: rank or badge wording, if any
- evidenceTier: T2 official rank or badge, T3 platform-displayed sold or bought count, T4 reviews or engagement only, T5 unverified
- metricScope: lifetime, recent, or unknown. "bought in past month" is recent and a rounded floor.
- rating, reviewCount, observedPriceUsd
- imageUrls (up to 3)
- restrictedFlag (master gate G9)

Description, feature bullets, and specs are copied in Stage 2 from the confirmed page.

## Exclude

- Brand-gated or licensed goods and likely counterfeits
- Restricted categories: supplements, cosmetics, children's products needing certification, lithium-battery goods, weapons, vapes
- Listings with only a supplier or wholesale page

## Hard rules

- Every URL is a real US product page you opened in this search: ebay.com/itm, amazon.com/dp, walmart.com/ip, a temu.com goods page, tiktok.com/shop/pdp, etsy.com/listing, or wish.com/product. TikTok videos and shop pages are not product pages. Never write a URL from memory or guess an item ID or ASIN. No search pages, homepages, or placeholders. The backend re-checks each link and drops the product if none is confirmed.
- Never present views, likes, or reviews as sales.
- A shorter list with T2 or T3 evidence beats a long list of guesses.
