# eBay Analytics redesign — design

**Status:** approved by the user (2026-11-24). Third in the per-section series; eBay keeps its own code (no sharing with the Temu/TikTok folders).

## What eBay gives
Sales: the dashboard's synced orders (eBay refuses this app the earnings scope). Traffic: Analytics API traffic report, by `DAY` or by `LISTING`, any date range — `LISTING_IMPRESSION_TOTAL`, `LISTING_VIEWS_TOTAL`, `CLICK_THROUGH_RATE`, `SALES_CONVERSION_RATE`, `TRANSACTION`; data lags about a day. Seller level: standards profiles (level, defect / late shipment / cases closed). Customer-service metrics vs similar sellers (rating).

## Layout (one page, no tabs)
1. Header: period select 7/30/60/90 days; dates shown; "Traffic up to <eBay's last day>".
2. **Needs attention:** a program whose level is Below Standard → Metrics; a service metric rated High / Very high vs similar sellers; low / out of stock → Inventory. Nothing → "All good". A failed check reads "Couldn't check…" with Retry, never "All good".
3. **Tiles vs previous period:** Revenue, Orders, Avg order, Profit (margin) — from orders; Impressions, Page views, Click-through (pts), Conversion (pts) — from daily traffic.
4. **Revenue by day** (previous dotted), grouped in the viewer's time zone.
5. **Traffic by day:** impressions and page views.
6. **Listings (last 30 days):** impressions, views, click-through, conversion, sold, link; badge "Seen, rarely clicked" when impressions ≥ 100 and click-through < half the shop's.
7. **Seller level:** each program, level, rates, Metrics drill-down; service metrics vs similar sellers.

## Approach
New eBay-only `GET /api/ebay/analytics/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ latestDate, days: [{ date, impressions, views, sold }] }` (DAY dimension). Sales from the existing order endpoints (with `tz`; plain-day `to` counts in full). Listings and seller level from the existing loader, which gains `levelCode` and `ratingCode`.

## Calls I made
- Both periods are whole days ending yesterday (eBay's traffic has no today), moved earlier to eBay's last traffic day if that is earlier; sales use the same days so tiles compare like with like.
- Click-through = views ÷ impressions, conversion = sold ÷ views, over the whole period.
- Traffic refused → traffic tiles and chart say "eBay isn't sharing traffic: reconnect eBay in Settings", sales still show.
