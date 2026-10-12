---
name: dynamic-page-extraction
description: Handle JavaScript-rendered product pages, lazy-loaded content, and expandable review sections using browser capabilities.
---

# Dynamic Page Extraction

## Purpose
Extract data from JS-rendered pages (Temu, TikTok Shop, Walmart, modern eBay/Amazon
views) where static HTML is insufficient.

## Steps
1. Wait for the target selector (price, reviews block) with a bounded timeout (15s);
   on timeout, record partial data + `unavailable` for the rest.
2. Expand lazy/review sections once (cap: 2 expansions per page) for `review-analysis`.
3. Re-extract after render settles; diff against static HTML to catch injected prices.
4. Record `renderedAt` alongside `dataCollectedAt`.

## Output
`MarketplaceResearch`-shaped JSON + `{ rendered: true, expansionsUsed, timeouts[] }`.

## Rules
- Never auto-play media, open chats, or trigger purchases while rendering.
- If rendering fails twice for a host, fall back to search-snippet evidence only.
