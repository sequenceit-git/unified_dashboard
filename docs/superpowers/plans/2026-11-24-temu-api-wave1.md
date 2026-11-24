# Temu API Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temu sellers see full order and goods detail, Temu-side stock, Temu's recommended prices, after-sales detail and per-product ad results, and can enrol goods into Temu activities — with each feature checked against the API list the Temu app was granted.

**Architecture:** As in the other shops' wave 1, inside the Temu folders only: tables with a `tab` in Temu section loaders, actions as Temu app routes, one Temu `SectionView`; drawer panels for order and goods detail. New: the shop's granted Temu methods are stored at connect, and a table whose method isn't granted says so instead of failing.

**Tech Stack:** Node 24, Express 5, node:test + `test/helpers/stub.js`; React + Vite, `components/ui`.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-rollout-design.md`. Methods: `docs/api-coverage/catalog/temu.json` (public mirror of the Temu partner reference; field names come from each method's page there).

## Global Constraints

- Only `backend/marketplaces/temu/`, `frontend/src/marketplaces/temu/`, tests and `docs/api-coverage/` change.
- Calls use `temu.call(method, { access_token: token, ...params })` (see `sections/helpers.js`).
- Granted methods: `shop.grantedScopes` = the token's `apiScopeList`. A shop without the list (connected before this change) is treated as allowing everything until its list is fetched (Task 1). A method not in the list shows: `This needs "<method>" enabled for the app in the Temu partner account, then reconnect the shop in Settings.`
- The buyer's full address (`bg.order.decryptshippinginfo.get`) is fetched only when a user clicks "Show full address" in the order drawer, is never stored or cached, and needs the orders route permission.
- Row/table/detail actions: same contract as the TikTok wave-1 plan (`POST`/`GET /api/temu/sections/<section>/<action>`, `sectionGuard`).
- Existing Temu action code (`after-sales/rowActions.jsx`, `tableActions.jsx`, `promotions` actions) keeps working through `SectionView` render props.
- Push to `main` after each task. Never touch production data.

## Review Focus

1. A shop connected before this change has no granted list → features still load (no false "not enabled") until the list is fetched → Task 1 test `a shop without a granted list is not blocked`.
2. The full-address button is used by a user without orders permission → 403, Temu not called → Task 3 test `full address needs orders permission`.
3. Temu SKUs that the dashboard doesn't know show in stock and price tables with Temu's ids → Task 5 test `unknown SKUs still show`.
4. Enrolling goods whose activity price is above Temu's limit is refused with Temu's message per goods, others still enrol → Task 8 test `partial enrol reports each refused goods`.
5. Ad report with no ads in the period shows an empty table, not an error → Task 7 test `no ads means an empty report`.

---

### Task 1: Granted methods and the Temu SectionView

**Files:** modify `backend/marketplaces/temu/client.js` (`exchangeCode` → `grantedScopes`), `backend/marketplaces/temu/sections/helpers.js` (`grantAware(shop, method, load)`), `backend/marketplaces/temu/app/routes/shopTools.js` + service (`POST /api/temu/shops/:id/refresh-permissions` → `bg.open.accesstoken.info.get`, saves `grantedScopes`; same access checks as the other `/:id` shop tools); create `frontend/src/marketplaces/temu/sectionTabs.js`, `SectionView.jsx`, `ActionButton.jsx`, `sectionFormat.jsx`; modify Temu `ads`, `after-sales`, `price-reviews`, `promotions`, `shipping` pages to use `SectionView` (delete their copied `SectionTable.jsx` and `sectionFormat.jsx`); tests `backend/marketplaces/temu/test/grants.test.js`, `frontend/test/temu-sections.test.mjs`.

**Interfaces:** Produces `grantAware(shop, method, load)` (rejects with the constraint message when `shop.grantedScopes` exists and lacks `method`; otherwise runs `load`), `exchangeCode()` result `grantedScopes: reply.apiScopeList` (falls back to calling `bg.open.accesstoken.info.get` when the reply lacks it), and the SectionView contract of the TikTok plan's Task 1.

- [ ] **Step 1: Failing tests** — `a new connection stores the granted methods`; `a method not granted gives the partner-account message` (load not called); `a shop without a granted list is not blocked`; `refresh-permissions saves the token's list` (uses `bg.open.accesstoken.info.get`); frontend `tables group into tabs in loader order`, `an action button is disabled while its request runs`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement; the five pages look as today.
- [ ] **Step 4:** run → PASS; backend `npm test`; frontend `npm test && npm run build`.
- [ ] **Step 5:** Commit `"Temu: store granted methods; one SectionView with tabs and actions"`.

### Task 2: Goods — full detail, SKUs, publication status, seller codes

**Files:** modify `backend/marketplaces/temu/app/routes/products.js` + `app/services/products.js` (`GET /api/temu/goods/:goodsId/detail`, `POST /api/temu/goods/:goodsId/sku-codes`), `frontend/src/marketplaces/temu/sections/goods/ProductModal.jsx` (Temu detail panel `TemuDetail.jsx`); test `backend/marketplaces/temu/app/test/goods-detail.test.js`.

**Interfaces:** `detail` combines `bg.local.goods.detail.query`, `bg.local.goods.sku.list.query` and `bg.local.goods.publish.status.get` → `{ goods: { title, category, images, attributes }, skus: [{ skuId, spec, price, stock, sellerCode }], status: { state, reason? } }`. `sku-codes` sets the seller's own SKU code on Temu SKUs: checks with `bg.local.goods.sku.out.sn.check`, then `bg.local.goods.sku.out.sn.set`; body `{ codes: [{ skuId, code }] }`; a duplicate code is refused per SKU with Temu's message.

- [ ] **Step 1: Failing tests** — `goods detail joins goods, SKUs and publication status`; `a rejected goods shows Temu's reason`; `seller codes are checked before they are set`; `a duplicate code is refused without setting any`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu goods: full detail, publication status and seller SKU codes"`.

### Task 3: Orders — full detail and the buyer's address on request

**Files:** modify `backend/marketplaces/temu/app/routes/orders.js` + services (`GET /api/temu/orders/:orderSn/detail`, `POST /api/temu/orders/:orderSn/full-address`), `frontend/src/marketplaces/temu/sections/orders/OrderDrawer.jsx`; test `backend/marketplaces/temu/app/test/order-detail.test.js`.

**Interfaces:** `detail` → `bg.order.detail.v2.get` mapped to `{ items: [{ goodsId, skuId, title, qty, price }], amounts, status, timeline }` plus `temu.order.amount.v2.query` for the amount breakdown. `full-address` → `bg.order.decryptshippinginfo.get` → `{ name, phone, address }`, response header `Cache-Control: no-store`, nothing written to the database or logs.

- [ ] **Step 1: Failing tests** — `order detail lists items and amounts`; `full address is fetched only on request and not cached` (cache module stub not called); `full address needs orders permission`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu orders: full detail and buyer address on request"`.

### Task 4: Inventory — Temu stock check

**Files:** modify `backend/marketplaces/temu/app/routes/inventory.js` + services (`GET /api/temu/inventory/temu-stock`), `frontend/src/marketplaces/temu/sections/inventory/InventoryPage.jsx` (tab "Temu stock", `TemuStockTab.jsx`); test `backend/marketplaces/temu/app/test/temu-stock.test.js`.

**Interfaces:** `temu.local.goods.sku.stock.query` for the shop's listed goods (batch size from its reference page) → `[{ sku, goodsId, skuId, temuStock, dashboardStock, mismatch }]`, mismatches first.

- [ ] **Step 1: Failing tests** — `stock is compared per SKU and mismatches come first`; `unknown SKUs still show`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu inventory: stock on Temu vs the dashboard"`.

### Task 5: Price reviews — recommended and current supplier price

**Files:** modify `backend/marketplaces/temu/sections/price-reviews.js`; test `backend/marketplaces/temu/test/sections-price-reviews.test.js`.

**Interfaces:** New table `pricing` (tab "Price guide", first): per SKU of the shop's goods — current supplier price (`bg.local.goods.sku.list.price.query`), Temu's recommended price (`temu.local.goods.recommendedprice.query`), difference %; sorted by difference desc. Each via `grantAware`. Existing price-review tables get tab "Price reviews".

- [ ] **Step 1: Failing tests** — `each SKU shows current and recommended price`; `unknown SKUs still show`; `a method not granted leaves the other tables loading`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu price reviews: Temu's recommended price per SKU"`.

### Task 6: After-sales — line detail

**Files:** modify `backend/marketplaces/temu/sections/after-sales.js`, routes/services (detail action `aftersales`); test `backend/marketplaces/temu/test/sections-after-sales.test.js`.

**Interfaces:** After-sales rows gain detail `aftersales` → `bg.aftersales.aftersales.list.get` (lines of that parent after-sale) + `temu.aftersales.parentaftersales.detail.get` (record) → tables "Lines" and "History".

- [ ] **Step 1: Failing tests** — `after-sales detail lists each line and its history`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu after-sales: line detail and history"`.

### Task 7: Ads — per-product report

**Files:** modify `backend/marketplaces/temu/sections/ads.js`; test `backend/marketplaces/temu/test/sections-ads.test.js`.

**Interfaces:** Table `goodsReport` (tab "By product") from `temu.searchrec.ad.reports.goods.query` for the same period as the existing shop report — goods, spend, impressions, clicks, CTR, orders, sales, ROAS; sorted by spend desc. Existing tables get tab "Overview".

- [ ] **Step 1: Failing tests** — `the product report shows spend and ROAS per goods`; `no ads means an empty report`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu ads: results per product"`.

### Task 8: Promotions — enrol goods into activities

**Files:** modify `backend/marketplaces/temu/sections/promotions.js`, routes/services (row action `enrol`, detail action `enrolled`); test `backend/marketplaces/temu/test/sections-promotions.test.js`.

**Interfaces:** Activity rows (existing, from `bg.promotion.activity.query`) gain detail `enrolled` → `bg.promotion.activity.goods.query` and action `enrol` "Enrol goods" with `input` = the candidate list from `bg.promotion.activity.candidate.goods.query` (multi-select with activity price per SKU) → `bg.promotion.activity.goods.enroll`, then `bg.promotion.activity.goods.operation.query` for the result; returns `{ message, refused: [{ goodsId, reason }] }`.

- [ ] **Step 1: Failing tests** — `candidates come from Temu for that activity`; `enrolled goods are listed`; `partial enrol reports each refused goods`.
- [ ] **Steps 2–4**, **Step 5:** Commit `"Temu promotions: enrol goods into activities"`.

### Task 9: Coverage check and docs

- [ ] **Step 1: Failing test** `Temu wave 1 methods are covered` — each `covered`: `bg.open.accesstoken.info.get`, `bg.local.goods.detail.query`, `bg.local.goods.sku.list.query`, `bg.local.goods.publish.status.get`, `bg.local.goods.sku.out.sn.check`, `bg.local.goods.sku.out.sn.set`, `bg.order.detail.v2.get`, `temu.order.amount.v2.query`, `bg.order.decryptshippinginfo.get`, `temu.local.goods.sku.stock.query`, `bg.local.goods.sku.list.price.query`, `temu.local.goods.recommendedprice.query`, `bg.aftersales.aftersales.list.get`, `temu.aftersales.parentaftersales.detail.get`, `temu.searchrec.ad.reports.goods.query`, `bg.promotion.activity.candidate.goods.query`, `bg.promotion.activity.goods.enroll`, `bg.promotion.activity.goods.query`, `bg.promotion.activity.goods.operation.query`.
- [ ] **Steps 2–4:** run → FAIL only for uncalled methods → `npm run api-coverage` → all suites green.
- [ ] **Step 5:** Commit `"Temu wave 1: coverage and docs"` (update `backend/marketplaces/README.md` Temu part).
