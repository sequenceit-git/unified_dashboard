# TikTok Shop Analytics redesign — design

**Status:** approved by the user (2026-11-24). Second in the per-section redesign series; TikTok need not match Temu or eBay (shops stay independent: no shared code between shop folders).

## Intent
One TikTok-only page, top to bottom: *is the shop healthy?* → *how is it selling?* → *why* (where sales come from, traffic, products, today). Layout handed to me; approved as sketched.

## What TikTok gives (per day, `GET /analytics/202509/shop/performance`, granularity 1D)
`sales`: `gmv.overall` + `gmv.breakdowns[]` by `type` VIDEO / LIVE / PRODUCT_CARD, `orders_count`, `items_sold`, `refunds`, `avg_customers_count`; `traffic`: `avg_page_views`, `avg_visitors`, `avg_conversation_rate` (string ratio, e.g. "0.3342"); `latest_available_date` (data lags ~1 day). No comparison intervals in this version → the previous period is a second call. Health: Shop Performance Score overview / benefits / metrics (existing loader). Products: SKU and product performance (existing). Today by hour (existing).

## Layout (one page, no tabs)
1. Header: title, period select (7/30/60/90 days), "Data up to <latest date>".
2. **Shop health**: score, tier, better-than-peers %, benefits unlocked; each metric whose status is not good as a line with value, target and a **Diagnose** button (existing detail drill-down). All metrics fine → "All metrics on track".
3. **Tiles** with change vs previous period: GMV (sub: refunded amount), Orders, Avg order, Visitors/day, Conversion (change in percentage points), Profit (with margin; from dashboard orders).
4. **GMV by day**, previous period dotted.
5. **Where sales come from** (Video / LIVE / Product card share of GMV) beside **Traffic** (page views and visitors by day).
6. **Top products** (SKU performance: GMV, orders, units, Details drill-down).
7. **Today by hour** (GMV, orders, visitors).

## Approaches
- **Chosen — one new TikTok-only endpoint** `GET /api/tiktok/analytics/performance?from&to` returning every daily figure (sales, channels, traffic) plus the latest date. Health, products and hourly keep using the TikTok analytics section loader (`/api/tiktok/sections/analytics`) and its detail drill-downs.
- Not chosen — stretching the shared summary/revenue endpoints: shaped for the old layout, would grow awkward.

## Calls I made (correct me)
- If TikTok refuses the analytics data, the endpoint returns `source: 'orders'` with GMV/orders/items from dashboard orders; traffic, channel and conversion blocks say "TikTok isn't sharing this data" instead of zeros.
- A metric "needs attention" when its status text isn't a good one (Excellent / Good / Great / On track / Meets): TikTok doesn't document its status values.
- Visitors/day and conversion are the mean of TikTok's daily values over days that have data.
- Each block loads and fails on its own (error + Retry); the rest of the page still renders.
- Days are TikTok's own dates (TikTok groups them in the shop's time zone); the page uses them as given.

## Non-goals
Videos & LIVE section (separate page), other shops, new TikTok scopes.
