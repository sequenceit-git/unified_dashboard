# TikTok Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the tabbed TikTok Analytics page with one page: Shop health → tiles vs previous period → GMV by day → channel share + traffic → top products → today by hour.

**Architecture:** New backend endpoint returns full daily TikTok performance (fallback to dashboard orders). Health/products/hourly come from the existing section loader. All "what to show" logic lives in a pure `analyticsView.js` under the TikTok folder (tested with node:test); components only render.

**Tech Stack:** Express 5 + node:test (`test/helpers/stub.js`), React 19 + Vite + recharts + `components/ui`.

**Spec:** `docs/superpowers/specs/2026-11-24-tiktok-analytics-redesign-design.md`

## Global Constraints
- TikTok code only under `marketplaces/tiktok_shop` (backend and frontend); nothing imported from the Temu or eBay folders; no shop literals in shared files.
- Periods 7/30/60/90 days, default 30, labels "Last N days".
- Fallback copy exactly: "TikTok isn't sharing this data".
- Health all fine copy exactly: "All metrics on track".

## Review Focus
1. TikTok returns a day with missing `traffic` or `breakdowns` → that day counts as no data (not 0) for visitors/conversion averages; channels sum what exists. Test: Task 2 `totals`.
2. Conversion arrives as a string ratio ("0.0215") → shown as 2.2 %, change in percentage points. Test: Task 2.
3. Previous period with zero GMV → change "—". Test: Task 2.
4. Analytics scope refused → `source: 'orders'`, page still shows GMV/orders. Test: Task 1.
5. Sub-admin without the TikTok shop → no TikTok call, orders fallback filtered as today. Test: Task 1.

---

### Task 1: Backend — `GET /api/tiktok/analytics/performance`, ids on health tiles

**Files:** Modify `backend/marketplaces/tiktok_shop/analytics.js` (`shopPerformance` also returns `latestDate`), `hooks.js` (new `analytics.dailyPerformance`), `app/services/analytics.js` (new `performance`), `app/routes/analytics.js` (route), `sections/analytics.js` (tile ids, `statusCode` on health rows). Tests: `backend/marketplaces/tiktok_shop/app/test/analytics-performance.test.js` (new), `backend/marketplaces/tiktok_shop/test/sections-analytics.test.js`. Update `backend/test/__snapshots__/routes.json`.

**Produces:** `performance(ctx) → { source: 'tiktok'|'orders', latestDate: 'YYYY-MM-DD'|null, days: [{ date, gmv, orders, items, refunds, customers, pageViews, visitors, conversion, channels: { video, live, productCard } }] }` — money as numbers (2 dp), conversion as a ratio number or null, traffic/channel fields null in the orders fallback. Health tiles ids: `'sps-score'`, `'peers'`, `'benefits'`, dimensions `'dimension'`.

- [ ] Step 1: tests — (a) TikTok interval `{ start_date: '2026-11-20', sales: { gmv: { overall: { amount: '100' }, breakdowns: [{ type: 'VIDEO', gmv: { amount: '60' } }, { type: 'LIVE', gmv: { amount: '10' } }, { type: 'PRODUCT_CARD', gmv: { amount: '30' } }] }, orders_count: 4, items_sold: 5, refunds: { amount: '8' }, avg_customers_count: 3 }, traffic: { avg_page_views: 200, avg_visitors: 120, avg_conversation_rate: '0.025' } }` → day `{ date: '2026-11-20', gmv: 100, orders: 4, items: 5, refunds: 8, customers: 3, pageViews: 200, visitors: 120, conversion: 0.025, channels: { video: 60, live: 10, productCard: 30 } }`, `source: 'tiktok'`, `latestDate` passed through; (b) TikTok throws → `source: 'orders'`, days from Order.aggregate, `visitors: null`, `channels: null`; (c) sub-admin whose allowedShopIds lacks the shop → no TikTok call, `source: 'orders'`; (d) sections test: health tile ids.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: `npm test` green (regenerate routes snapshot). Step 5: commit.

### Task 2: Frontend — `tiktok_shop/sections/analytics/analyticsView.js`

**Produces:** `PERIODS`, `periodRanges(days, now?)`, `change(cur, prev)` (percent, uses `Math.abs(prev)`, null when prev 0), `pointsChange(cur, prev)` (percentage points, 1 dp, null if either null), `totals(days) → { gmv, orders, avgOrder, refunds, visitorsPerDay|null, conversion|null (percent 1 dp) }`, `channelShare(days) → [{ key, label, amount, share }] | null` (labels Video / LIVE / Product card; null when no day has channels), `withPrevious(cur, prev, n, currentFrom)` (by day index, rows `{ date, gmv, prevGmv }`), `trafficRows(days)`, `healthView(section) → { score, tier, peers, benefits, problems: [{ id, metric, value, target, status, reason }], allGood, error }`, `needsWork(statusText) → boolean`.

- [ ] Step 1: tests in `frontend/test/tiktok-analytics.test.mjs` covering Review Focus 1–3, channel share sums to 100, `needsWork('Excellent') === false`, `needsWork('Needs work') === true`, `needsWork('') === false`, healthView with a table error.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + `npm test`. Step 5: commit.

### Task 3: Frontend — the page

**Files:** rewrite `tiktok_shop/sections/analytics/AnalyticsPage.jsx`; create `ShopHealth.jsx`, `ResultTiles.jsx`, `ChannelShare.jsx`, `TrafficChart.jsx`, `TopSkus.jsx`, `TodayByHour.jsx`; modify `RevenueChart.jsx` (GMV + dotted previous); delete `MarketplaceChart.jsx`, `TopProducts.jsx` if unused. Diagnose / Details buttons open the existing detail drill-downs (`GET /api/tiktok/sections/analytics/metric?id=` / `sku?id=`) in a modal, reusing the TikTok folder's existing detail modal if there is one.

- [ ] Step 1: build page and blocks (each `{ loading, error, onRetry }`). Step 2: `npx oxlint src/marketplaces/tiktok_shop && npm test && npm run build`. Step 3: commit and push.
