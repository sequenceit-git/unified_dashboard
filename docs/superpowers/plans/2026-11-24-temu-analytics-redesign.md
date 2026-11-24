# Temu Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tab Temu Analytics page with one Temu-only page: Needs attention → result tiles with change vs previous period → revenue & orders by day → Top goods + Store health → Ads (only with ad data).

**Architecture:** Page-only redesign on existing data. Results come from `/api/temu/analytics/{summary,revenue,products,inventory}` (summary and revenue fetched a second time for the previous period); health comes from the Temu insights loader `GET /api/temu/sections/analytics` (`{ summary: tiles[], tables: [{ id, rows, error? }] }`). All decisions about what to show live in one pure module (`analyticsView.js`) tested with node:test; components only render.

**Tech Stack:** React 19 + Vite, recharts, Tailwind, `components/ui` (Card, StatCard, DataTable, Feedback, Input Select), node:test (frontend via `vite.ssrLoadModule`, backend via `test/helpers/stub.js`).

**Spec:** `docs/superpowers/specs/2026-11-24-temu-analytics-redesign-design.md`

## Global Constraints

- Temu-only: no shop-name literals in shared files (`backend/test/no-shop-branches.test.js`); Temu code stays under `marketplaces/temu`.
- No new Temu API calls; no change to other shops' pages.
- Period options exactly: 7, 30, 60, 90 days (labels "Last 7 days" … "Last 90 days"), default 30.
- Links: Goods → `/temu/goods`, Inventory → `/temu/inventory`, Returns → `/temu/after-sales`.
- Nothing wrong → the Needs attention block reads exactly "All good".
- Ads block renders only when the insights loader returned an ad tile.
- Insights-window figures (returns/cancellations per 100, store tags, ads) are labelled "last 30 days" and have no change arrow.
- Money as `$` with 2 decimals; percentages one decimal.

## Review Focus

1. Previous period with zero revenue/orders → change shows "—" (not Infinity / NaN). Test in Task 2.
2. Insights loader fails or a table carries `error` → health blocks show their own error with Retry; result tiles and chart still render. Test in Task 2 (`attentionItems` with missing tables) + Task 3 render rule.
3. Product sold on Temu with several SKUs / listings → all its goods IDs are matched for the traffic badge. Test in Task 1.
4. Revenue days missing in one period (no orders that day) → previous-period line aligns by day index from period start, missing days count 0. Test in Task 2.
5. Sub-admin limited to some shops → products endpoint still filters as today (goodsIds lookup must not widen access). Test in Task 1.

---

### Task 1: Backend — goods IDs on top products, ids on insight tiles

**Files:**
- Modify: `backend/marketplaces/temu/app/services/analytics.js` (`products`)
- Modify: `backend/marketplaces/temu/sections/analytics.js` (tiles)
- Test: `backend/marketplaces/temu/app/test/analytics.test.js`, `backend/marketplaces/temu/test/sections-analytics.test.js`

**Interfaces:**
- Produces: `GET /api/temu/analytics/products` rows `{ productId, sku, title, qty, revenue, goodsIds: string[] }` — `goodsIds` = distinct goodsId part of `Listing.externalListingId` (`"<goodsId>:<skuId>"`) for that product, `marketplace: 'temu'`, restricted to `ctx.allowedShopIds` for sub-admins.
- Produces: insight tiles carry `id`: `'ad-share'`, `'ad-spend'`, `'returns-per-100'`, `'cancels-per-100'` (labels unchanged).

- [ ] **Step 1: Write the failing tests**
  - `analytics.test.js`: `'top goods carry their Temu goods ids'` — Order.aggregate returns `[{ _id: 'p1', sku: 'A', title: 'Case', qty: 2, revenue: 20 }]`; Listing stub `find(filter)` returns `[{ productId: 'p1', externalListingId: '77:1' }, { productId: 'p1', externalListingId: '77:2' }, { productId: 'p1', externalListingId: '88:5' }]` and records `filter`. Assert `out[0].goodsIds` deep-equals `['77', '88']`; for a sub-admin ctx (`allowedShopIds: ['s1']`) assert the recorded filter has `shopId: { $in: ['s1'] }` and `marketplace: 'temu'`.
  - `sections-analytics.test.js`: extend `'ads share of sales and order health over 30 days'` to assert `summary.map((t) => t.id)` deep-equals `['ad-share', 'ad-spend', 'returns-per-100', 'cancels-per-100']`.
- [ ] **Step 2: Run** `cd backend && node --test marketplaces/temu/app/test/analytics.test.js marketplaces/temu/test/sections-analytics.test.js` — Expected: the two new assertions FAIL.
- [ ] **Step 3: Implement** — in `products`, after the aggregate, one `Listing.find({ productId: { $in: ids }, marketplace: 'temu', externalListingId: /^\d+:\d+$/, ...(sub-admin ? { shopId: { $in: ctx.allowedShopIds || [] } } : {}) }).select('productId externalListingId').lean()`, group goodsIds per product (distinct, in first-seen order). Add the four `id`s to the tiles.
- [ ] **Step 4: Run** the same command plus `npm test` — Expected: PASS, full suite green.
- [ ] **Step 5: Commit** `git commit -m "Temu analytics: goods ids on top goods, ids on insight tiles"`

### Task 2: Frontend — `analyticsView.js` (what the page shows)

**Files:**
- Create: `frontend/src/marketplaces/temu/sections/analytics/analyticsView.js`
- Test: `frontend/test/temu-analytics.test.mjs`

**Interfaces:**
- Produces:
  - `PERIODS` = `[{ value: '7', label: 'Last 7 days' }, …'30', '60', '90']`
  - `periodRanges(days: number|string, now: Date) → { current: { from, to }, previous: { from, to } }` — ISO strings; current = start of day `(days-1)` days ago → end of today; previous = the `days` days before current.from (ends 1 ms before it).
  - `change(current: number, previous: number) → number|null` — percent, one decimal; `null` when previous is 0 or either is not finite.
  - `margin(profit, revenue) → number|null` — percent one decimal; `null` when revenue ≤ 0.
  - `withPrevious(current: [{date,revenue,orders}], previous: same, days, currentFrom: ISO) → [{ date, revenue, orders, prevRevenue }]` — one row per day of the current period (dates `YYYY-MM-DD`), missing days 0; `prevRevenue` = previous period's revenue on the same day index.
  - `insights(section) → { traffic: rows|null, trafficError, tags: rows|null, tagsError, tile(id) → value|null, adsShown: boolean }` from the loader response; `adsShown` true when tile `'ad-share'` or `'ad-spend'` exists.
  - `trafficByGoods(trafficRows) → Map<goodsId, 'Traffic restricted'|'Low traffic'>`
  - `RETURNS_ALERT = 5`
  - `attentionItems({ traffic, inventory, returnsPer100 }) → [{ id, text, to }]` — in this order, only when present: `restricted` ("N goods traffic-restricted", `/temu/goods`), `low-traffic` ("N goods with low traffic", `/temu/goods`), `stock` ("N low stock, M out of stock", `/temu/inventory`, when lowCount > 0), `returns` ("Returns R per 100 orders (last 30 days)", `/temu/after-sales`, when R ≥ RETURNS_ALERT). Singular "1 goods" is fine (Temu's own word).

- [ ] **Step 1: Write the failing tests** (`frontend/test/temu-analytics.test.mjs`, vite `load` pattern from `temu-sections.test.mjs`):
  - `periodRanges(7, new Date('2026-11-24T15:00:00'))`: current.from is local start of 2026-11-18, previous.to is 1 ms before it, previous.from is start of 2026-11-11.
  - `change(110, 100) === 10`, `change(5, 0) === null`, `change(0, 0) === null`, `change(90, 100) === -10`.
  - `margin(25, 100) === 25`, `margin(5, 0) === null`.
  - `withPrevious([{ date: '2026-11-19', revenue: 10, orders: 1 }], [{ date: '2026-11-16', revenue: 4, orders: 1 }], 3, <start of 2026-11-18>)` → 3 rows `2026-11-18/19/20`; row 1 `{ revenue: 0, orders: 0, prevRevenue: 0 }`, row 2 `{ revenue: 10, orders: 1, prevRevenue: 4 }` (previous period is 2026-11-15..17; 2026-11-16 is its day index 1 → lands on 2026-11-19), row 3 `{ revenue: 0, prevRevenue: 0 }`.
  - `attentionItems`: two restricted + one low-traffic row, inventory `{ lowCount: 5, outCount: 1 }`, returnsPer100 6.2 → ids `['restricted','low-traffic','stock','returns']`, texts `'2 goods traffic-restricted'`, `'5 low stock, 1 out of stock'`; returnsPer100 4 → no `returns`; all empty / null inputs → `[]`.
  - `insights` on `{ summary: [{ id: 'returns-per-100', value: 3 }], tables: [{ id: 'traffic', rows: [], error: 'x' }] }` → `trafficError === 'x'`, `tile('returns-per-100') === 3`, `adsShown === false`; `insights(null)` doesn't throw and `adsShown === false`.
- [ ] **Step 2: Run** `cd frontend && node --test test/temu-analytics.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module (pure functions, no React).
- [ ] **Step 4: Run** the same — Expected: PASS; then `npm test` green.
- [ ] **Step 5: Commit** `git commit -m "Temu analytics: view rules (periods, change, attention, insights)"`

### Task 3: Frontend — the page

**Files:**
- Rewrite: `frontend/src/marketplaces/temu/sections/analytics/AnalyticsPage.jsx`
- Create: `NeedsAttention.jsx`, `ResultTiles.jsx`, `StoreHealth.jsx`, `AdsPanel.jsx` (same folder)
- Modify: `RevenueChart.jsx` (dotted `prevRevenue` line, title "Revenue & orders by day"), `TopProducts.jsx` (title "Top goods"; columns Goods, Sold, Revenue, Temu badge from `trafficByGoods` over `row.goodsIds`)
- Delete: `MarketplaceChart.jsx`

**Interfaces:**
- Consumes: Task 1 response fields; every export of Task 2.
- Page no longer uses `SectionView`; it fetches the insights loader itself with `useApi('/api/temu/sections/analytics')`. Each block takes `{ loading, error, onRetry }` and shows `Spinner` / `ErrorState` from `components/ui/Feedback` on its own.

- [ ] **Step 1:** Write `AnalyticsPage`: header + `Select` (`PERIODS`); `periodRanges`; `useApi` for summary/revenue (current and previous), products (limit 10), inventory, insights; render in order NeedsAttention → ResultTiles → RevenueChart (`withPrevious`) → grid(TopProducts, StoreHealth) → AdsPanel when `adsShown`. Keep `RequireShopSection` guard.
- [ ] **Step 2:** Components:
  - `NeedsAttention({ items, loading })`: amber card listing items as links (`react-router` `Link`), or a green "All good" line when `items` is empty and not loading.
  - `ResultTiles`: `StatCard`s Revenue, Orders, Avg order, Profit (sub: `margin`% margin), Returns per 100 (sub "last 30 days"); first four get a ▲/▼ `change` line vs previous (green up, red down; "—" when null).
  - `StoreHealth`: store tags list (or "No tags from Temu"), cancellations per 100 orders (last 30 days).
  - `AdsPanel`: ad spend, sales from ads %, from `tile('ad-spend')`, `tile('ad-share')`.
- [ ] **Step 3: Verify** `cd frontend && npx oxlint src/marketplaces/temu && npm test && npm run build` — Expected: no new lint errors, tests pass, build OK. `grep -rn MarketplaceChart src` → nothing.
- [ ] **Step 4: Commit** `git commit -m "Temu analytics: one page — needs attention, results vs previous period, top goods, store health, ads"` and push to main.
