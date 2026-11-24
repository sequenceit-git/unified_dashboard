# TikTok Shop API Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TikTok Shop sellers see per-product/SKU performance, shop health, video and LIVE results, balances and money detail, order price breakdowns, TikTok-side stock, package detail and tracking, return history and pre-publish listing checks — all with scopes the E-commerce connector app already holds.

**Architecture:** Same shape as eBay's wave 1, inside the TikTok folders only: tables with a `tab` in TikTok section loaders (`backend/marketplaces/tiktok_shop/sections/`), row/table actions as routes of the TikTok app, and one TikTok `SectionView` on the frontend. Drawer/modal panels (order price detail, product keywords, listing check) are TikTok components calling TikTok routes.

**Tech Stack:** Node 24, Express 5, node:test + `test/helpers/stub.js`; React + Vite, `components/ui`.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-rollout-design.md`. Endpoints: `docs/api-coverage/catalog/tiktok_shop.json` (each row links TikTok's own page in `docs`); app scopes: `docs/api-coverage/apps/tiktok_shop.json`.

## Global Constraints

- Only `backend/marketplaces/tiktok_shop/`, `frontend/src/marketplaces/tiktok_shop/`, tests and `docs/api-coverage/` change.
- Calls go through `sections/helpers.js` `ttGet(token, shop, path, query)` / `ttPost(token, shop, path, body, query)` (signing and `shop_cipher` are already handled).
- Use only the endpoints listed in Task 10; every one needs a scope from `apps/tiktok_shop.json`. A TikTok error whose code means "no permission/scope" shows: `Your TikTok app doesn't have the <scope> scope: enable it in Partner Center, then reconnect the shop in Settings.`
- Date windows: performance lists use the last 30 full days (`ttRange(30)`); "today by hour" uses the shop's date today (UTC).
- Row actions follow the eBay contract (`row.actions`, `POST /api/tiktok/sections/<section>/<action>`, `sectionGuard`), plus **detail actions** `{ id, label, detail: true }` → `GET /api/tiktok/sections/<section>/<action>?id=<row.id>` returning `{ title, summary?, tables }`, shown in a Modal. Table actions: `table.actions` with the same shape and no row id.
- Existing TikTok action code (`packages/tableActions.jsx`, `promotions/rowActions.jsx`, `promotions/tableActions.jsx`) keeps working through `SectionView`'s `renderRowActions`/`renderTableActions` props; it is not rewritten in this plan.
- Push to `main` after each task. Never touch production data.

## Review Focus

1. A SKU in the performance list that the dashboard doesn't know still shows (TikTok ids, no dashboard title) → Task 2 test `sku performance keeps unknown products`.
2. Shop-health metric codes with special characters are passed URL-encoded to the diagnosis call → Task 2 test `metric codes are encoded in detail calls`.
3. A balance in a second currency isn't summed into the first → Task 4 test `balances stay per currency`.
4. "Ship all ready packages" with none ready sends nothing and says so → Task 7 test `ship-all with nothing ready does not call TikTok`.
5. Listing check finds blocking issues → publishing is held with the issues listed, not sent → Task 9 test `blocking listing-check issues stop the publish`.

---

### Task 1: TikTok SectionView and scope-aware tables

**Files:** create `frontend/src/marketplaces/tiktok_shop/sectionTabs.js`, `SectionView.jsx`, `ActionButton.jsx`, `sectionFormat.jsx` (one copy, from the section folders); modify the TikTok `finance`, `packages`, `promotions`, `returns-cancellations`, `videos-live`, `creators` pages to render `<SectionView sectionId="…" renderRowActions? renderTableActions? />` and delete their copied `components/SectionTable.jsx` and per-folder `sectionFormat.jsx`; modify `backend/marketplaces/tiktok_shop/sections/helpers.js` (add `scopeAware(load, scope)`); tests `frontend/test/tiktok-sections.test.mjs`, `backend/marketplaces/tiktok_shop/test/sections-helpers.test.js`.

**Interfaces:** Produces `sectionTabs(data)` (same contract as the eBay plan's Task 2), `<SectionView sectionId extraTabs? renderRowActions? renderTableActions? />` supporting row, table and detail actions, and `scopeAware(load, scope)` (TikTok permission error → the Global Constraints message with that scope; other errors unchanged).

- [ ] **Step 1: Failing tests** — `tables group into tabs in loader order`; `tiles without a tab show on every tab`; `an action button is disabled while its request runs`; backend `a permission error names the missing scope` (load rejects with TikTok's permission error shape `{ code: 105005, message }`, or HTTP 403 → error text equals the constraint message for `'TikTok Shop Analytics'`); `other errors pass through unchanged`.
- [ ] **Step 2:** `cd frontend && node --test test/tiktok-sections.test.mjs`; `cd backend && node --test marketplaces/tiktok_shop/test/sections-helpers.test.js` → FAIL.
- [ ] **Step 3:** Implement; the six pages render exactly as today (existing actions via the render props).
- [ ] **Step 4:** run → PASS; backend `npm test`; frontend `npm test && npm run build`.
- [ ] **Step 5:** Commit `"TikTok pages: one SectionView with tabs, row, table and detail actions"`.

### Task 2: Analytics — products, SKUs and shop health

**Files:** create `backend/marketplaces/tiktok_shop/sections/analytics.js`; modify `sections/index.js`, `app/routes/sections.js`, `app/services/sections.js` (detail action `metric`), `frontend/src/marketplaces/tiktok_shop/sections/analytics/AnalyticsPage.jsx` (SectionView; current charts as `extraTabs` "Sales"); test `backend/marketplaces/tiktok_shop/test/sections-analytics.test.js`.

**Interfaces:** Tables (all `scopeAware(…, 'TikTok Shop Analytics')`):
- `skus` (tab "Products"): `GET /analytics/202509/shop_skus/performance` for `ttRange(30)`, sorted by GMV desc — SKU, product, page views, CTR, conversion, units sold, GMV; titles from the dashboard's listings when known; row detail action `sku` → `GET /analytics/202509/shop_skus/{sku_id}/performance` and `GET /analytics/202509/shop_products/{product_id}/performance` (daily table + traffic-source table).
- `health` (tab "Shop health"): tiles from `GET /analytics/202610/shop_performances/overview` and `GET /analytics/202610/shop_performances/benefits`; table from `GET /analytics/202606/shop_performances/metrics` — metric, value, target, status; detail action `metric` → `…/metrics/{metric_code}/diagnosis`, `…/problem_details`, `…/top_items` (three tables).
- `hourly` (tab "Today by hour"): `GET /analytics/202510/shop/performance/{date}/performance_per_hour` — hour, GMV, orders, visitors.

- [ ] **Step 1: Failing tests** — `sku performance lists the last 30 days by GMV`; `sku performance keeps unknown products`; `metric codes are encoded in detail calls` (`code 'a/b c'` → path `…/metrics/a%2Fb%20c/diagnosis`); `the metric detail returns diagnosis, problems and top items`; `hourly performance asks for today`.
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"TikTok analytics: product and SKU performance, shop health, today by hour"`.

### Task 3: Videos & LIVE — results

**Files:** modify `backend/marketplaces/tiktok_shop/sections/videos-live.js`, routes/services (detail actions `video`, `live`); test `backend/marketplaces/tiktok_shop/test/sections-videos-live.test.js`.

**Interfaces:** Tiles (tab "Video results") from `GET /analytics/202609/shop_videos/overview_performance`; table `videos` from `GET /analytics/202609/shop_videos/batch_performance` — video, posted, views, product clicks, orders, GMV; detail `video` → `GET /analytics/202509/shop_videos/{video_id}/performance` + `…/{video_id}/products/performance`. Tiles (tab "LIVE results") from `GET /analytics/202609/shop_lives/overview_performance`; existing LIVE rows gain detail `live` → `GET /analytics/202510/shop_lives/{live_id}/performance_per_minutes`. Existing tables keep their order as the first tab "Videos & LIVE".

- [ ] **Step 1: Failing tests** — `video results list views to GMV per video`; `video detail shows the products sold from it`; `live detail is per minute`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok videos and LIVE: results and per-video products"`.

### Task 4: Finance — balances, transactions, unsettled orders

**Files:** modify `backend/marketplaces/tiktok_shop/sections/finance.js`, routes/services (detail `statement`, `order`); test `backend/marketplaces/tiktok_shop/test/sections-finance.test.js`.

**Interfaces:** Tiles (tab "Balance") from `GET /finance/202609/account_balances` — one tile per currency and balance type; table `account` (tab "Balance") from `GET /finance/202609/account_transactions`; table `unsettled` (tab "Unsettled orders") from `GET /finance/202507/orders/unsettled` — order, estimated settlement, amount; existing statements rows gain detail `statement` → `GET /finance/202501/statements/{statement_id}/statement_transactions`; unsettled/order rows gain detail `order` → `GET /finance/202501/orders/{order_id}/statement_transactions`.

- [ ] **Step 1: Failing tests** — `balances stay per currency` (USD and GBP fixtures → two tiles, nothing summed); `unsettled orders show the estimated settlement`; `statement detail lists its transactions`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok finance: balances, account transactions, unsettled orders"`.

### Task 5: Orders — price breakdown in the order drawer

**Files:** modify `backend/marketplaces/tiktok_shop/app/routes/orders.js` + `app/services/orders.js` (`GET /api/tiktok/orders/:orderId/price-detail`), `frontend/src/marketplaces/tiktok_shop/sections/orders/OrderDrawer.jsx` (new `PriceDetail.jsx` panel, loaded when the drawer opens); test `backend/marketplaces/tiktok_shop/app/test/price-detail.test.js`.

**Interfaces:** Route returns `{ lines: [{ label, amount: { value, currency } }], total }` mapped from `GET /order/202407/orders/{order_id}/price_detail` (seller discount, platform discount, shipping fee and discounts, taxes, buyer paid). Uses the orders route's existing access checks (orders permission + shop scope).

- [ ] **Step 1: Failing tests** — `price detail lists discounts, shipping and tax`; `an order of another shop is refused` (sub-admin without that shop → 403, TikTok not called).
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok orders: price breakdown in the order drawer"`.

### Task 6: Inventory — TikTok stock check

**Files:** modify `backend/marketplaces/tiktok_shop/app/routes/inventory.js` + `app/services/inventory.js` (`GET /api/tiktok/inventory/tiktok-stock`), `frontend/src/marketplaces/tiktok_shop/sections/inventory/InventoryPage.jsx` (new tab "TikTok stock", `TikTokStockTab.jsx`); test `backend/marketplaces/tiktok_shop/app/test/tiktok-stock.test.js`.

**Interfaces:** Service pages `POST /product/202309/inventory/search` (by the shop's listed product ids, 50 per call) and returns `[{ sku, product, warehouses: [{ name, available }], tiktokTotal, dashboardStock, mismatch }]`, `mismatch = tiktokTotal !== dashboardStock`; mismatches first.

- [ ] **Step 1: Failing tests** — `stock is compared per SKU and mismatches come first`; `more than 50 products are fetched in pages of 50`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok inventory: stock on TikTok vs the dashboard"`.

### Task 7: Packages — detail, tracking, ship all ready

**Files:** modify `backend/marketplaces/tiktok_shop/sections/packages.js`, routes/services (detail `package`, table action `ship-all`); test `backend/marketplaces/tiktok_shop/test/sections-packages.test.js`.

**Interfaces:** Package rows gain detail `package` → `GET /fulfillment/202309/packages/{package_id}` + `GET /fulfillment/202309/orders/{order_id}/tracking` (tracking events table); table action `ship-all` "Ship all ready packages" (confirm) → `POST /fulfillment/202309/packages/ship` with the ready package ids (TikTok's batch limit per call from its docs page), returns `{ message: 'Shipped N packages' }` plus failures listed.

- [ ] **Step 1: Failing tests** — `package detail shows tracking events`; `ship-all sends only packages ready to ship`; `ship-all with nothing ready does not call TikTok`; `failed packages are reported by id`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok packages: detail, tracking and ship all ready"`.

### Task 8: Returns & cancellations — history and reject reasons

**Files:** modify `backend/marketplaces/tiktok_shop/sections/returns-cancellations.js`, routes/services; the existing reject action's form; test `backend/marketplaces/tiktok_shop/test/sections-returns.test.js`.

**Interfaces:** Return rows gain detail `records` → `GET /return_refund/202309/returns/{return_id}/records`; the reject action's `input` becomes a select filled from `GET /return_refund/202309/reject_reasons` (cached 1 day per shop) and sends the chosen reason code.

- [ ] **Step 1: Failing tests** — `return history lists each step`; `reject offers TikTok's reasons and sends the chosen code`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok returns: history and TikTok's reject reasons"`.

### Task 9: Products — search keywords and listing check

**Files:** modify `backend/marketplaces/tiktok_shop/app/routes/products.js` + services (`GET /api/tiktok/products/seo-words?productIds=`, `POST /api/tiktok/products/listing-check`), `frontend/src/marketplaces/tiktok_shop/sections/products/ProductModal.jsx` (keywords panel), `ListModal.jsx` / `DirectListModal.jsx` (run the check before publishing); test `backend/marketplaces/tiktok_shop/app/test/listing-check.test.js`.

**Interfaces:** `seo-words` → `GET /product/202405/products/seo_words` → `[{ productId, words: [{ word, searches? }] }]`. `listing-check` takes the same body the publish sends → `POST /product/202309/products/listing_check` → `{ ok, issues: [{ field, message, blocking }] }`. The List modals call it first; any `blocking` issue stops the publish and lists the issues; non-blocking ones show as warnings with "Publish anyway".

- [ ] **Step 1: Failing tests** — `keywords are returned per product`; `blocking listing-check issues stop the publish` (pure helper `canPublish(check)` in the TikTok listing folder: blocking → false); `warnings alone allow publishing`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"TikTok products: search keywords and pre-publish listing check"`.

### Task 10: Coverage check and docs

- [ ] **Step 1: Failing test** `TikTok wave 1 endpoints are covered` — each is `covered`: `GET /analytics/202509/shop_skus/performance`, `GET /analytics/202509/shop_skus/{sku_id}/performance`, `GET /analytics/202509/shop_products/{product_id}/performance`, `GET /analytics/202606/shop_performances/metrics`, `GET /analytics/202606/shop_performances/metrics/{metric_code}/diagnosis`, `GET /analytics/202606/shop_performances/metrics/{metric_code}/problem_details`, `GET /analytics/202606/shop_performances/metrics/{metric_code}/top_items`, `GET /analytics/202610/shop_performances/overview`, `GET /analytics/202610/shop_performances/benefits`, `GET /analytics/202510/shop/performance/{date}/performance_per_hour`, `GET /analytics/202609/shop_videos/overview_performance`, `GET /analytics/202609/shop_videos/batch_performance`, `GET /analytics/202509/shop_videos/{video_id}/performance`, `GET /analytics/202509/shop_videos/{video_id}/products/performance`, `GET /analytics/202609/shop_lives/overview_performance`, `GET /analytics/202510/shop_lives/{live_id}/performance_per_minutes`, `GET /finance/202609/account_balances`, `GET /finance/202609/account_transactions`, `GET /finance/202507/orders/unsettled`, `GET /finance/202501/statements/{statement_id}/statement_transactions`, `GET /finance/202501/orders/{order_id}/statement_transactions`, `GET /order/202407/orders/{order_id}/price_detail`, `POST /product/202309/inventory/search`, `GET /fulfillment/202309/packages/{package_id}`, `GET /fulfillment/202309/orders/{order_id}/tracking`, `POST /fulfillment/202309/packages/ship`, `GET /return_refund/202309/returns/{return_id}/records`, `GET /return_refund/202309/reject_reasons`, `GET /product/202405/products/seo_words`, `POST /product/202309/products/listing_check`.
- [ ] **Steps 2–4:** run → FAIL only for uncalled ids (fix the call) → `npm run api-coverage` → all suites green.
- [ ] **Step 5:** Commit `"TikTok wave 1: coverage and docs"` (update `backend/marketplaces/README.md` TikTok part).
