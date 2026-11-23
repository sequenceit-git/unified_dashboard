# Per-shop Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move each shop's backend logic (routes, services, sync) into `backend/marketplaces/<key>/app/`, so the three shops share no domain code, with the API and database unchanged.

**Architecture:** Each adapter gains an `app` member (`{ api, sync, catalog }`) built from that shop's own copies of today's shared routes and services, trimmed to the shop. Shared code keeps only infrastructure (models, middleware, scheduler, cache, notify, connection/OAuth, cross-shop pages) and reaches a shop through `registry.get(key).app`. A small shared coordinator fans product stock/price changes out to each listing's own shop.

**Tech Stack:** Node 24, Express 5, Mongoose, node:test, oxlint.

**Spec:** `docs/superpowers/specs/2026-11-24-per-shop-backend-design.md`

## Global Constraints

- Commit and push directly to `main` (user rule: no branches, no PRs). Push after each task.
- API unchanged: every path under `/api/<urlId>/…` and every JSON request/response shape stays as today. `test/__snapshots__/routes.json` must not change in any task.
- One database: no collection, field or index changes. Each shop's code queries only its own rows (`marketplace: '<key>'` or its own `shopId`s).
- Stays shared (spec 4–5): `models/`, `middleware/` (incl. `shopScope.js`), `utils/`, `config/`, `services/core/*` (scheduler, cache, events, notify, redis), auth/users, dashboard overview, research, settings, shop list / profiles / OAuth / connect / manual sync triggers.
- A shop folder never requires another shop's folder; shared code never requires a shop's `app/` internals except through `registry.get(key).app`.
- Behaviour unchanged: sync intervals and env flags, notifications, cache groups (`resp:analytics:`, `resp:dashboard:`, `shop:<id>:`), error messages and status codes.
- Never run anything against the production database; tests use stubs only (`test/helpers/stub.js`). Production scripts run via `docker compose exec backend`.

## Review Focus

1. A sale on one shop lowers the product's stock on its listings at the **other** shops (today `propagateStock`) → Task 1 test `fan-out pushes stock to every other shop's listing`.
2. Editing a product's price/title in one shop's page updates all its listings on every shop (today `pushProductChanges`) → Task 1 test `product changes reach each listing through its own shop`.
3. Market research "List on shop" / "Relist" still publish through the chosen shop → Task 5 test `research lists through the shop's app`.
4. A webhook (eBay notification, TikTok/Temu webhook) still runs the right shop's sync job → Task 1 test `scheduler runs the shop's own sync job`.
5. A sub-admin with eBay + Temu access sees only those shops' data on each shop API, and Overview totals still add both → Task 2/4 route tests reuse `test/shop-api.test.js` cases per shop; Task 5 keeps `dashboard` untouched.

---

## File structure (per shop, `backend/marketplaces/<key>/app/`)

```
app/index.js          { api, sync, catalog } — the shop's app (required lazily by the adapter)
app/api.js            express Router for /api/<urlId> (replaces ../api.js; same groups)
app/routes/           products, inventory, orders, customers, inbox*, analytics, sections, shopTools
app/services/         orders, customers, customerStats, products, productImport, inventory,
                      analytics, sections, inbox*            (* eBay and TikTok Shop only)
app/sync/             orders, listings, inbox*, stock — the shop's parts of today's manager
app/test/             the shop's service + route tests
```

Shared after the move: `services/catalog/fanOut.js` (new, cross-shop coordinator),
`services/marketplace/connection.js` (renamed remainder of `services/marketplace/index.js`: OAuth,
tokens `freshToken`/`withShopToken`, access checks, profiles, connect), `services/core/syncQueue.js`.

---

### Task 1: App contract, fan-out coordinator, scheduler dispatch (shared scaffolding)

**Files:**
- Modify: `backend/marketplaces/contract.js` (add `app` to OPTIONAL; document shape)
- Create: `backend/marketplaces/<key>/app/index.js` ×3 (bridge to today's shared code)
- Create: `backend/services/catalog/fanOut.js`
- Modify: `backend/services/core/syncQueue.js` (KINDS `run` → `app.sync.*`)
- Modify: callers of `propagateStock` / `pushProductChanges` (`services/marketplace/index.js`, `services/catalog/products.js`, `services/catalog/inventory.js`) → `fanOut`
- Test: `backend/test/app-contract.test.js`, `backend/test/fanout.test.js`, `backend/test/sync-dispatch.test.js`; extend `backend/test/no-shop-branches.test.js`

**Interfaces:**
- Produces: adapter getter `app` → `{ api: Router, sync: { orders(shop), listings(shop), access(shop), full(shop), inbox?(shop) }, catalog: { pushStock(shop, listing, product) → Promise<object>, pushChanges(shop, listing, product, changes) → Promise<object>, publish(shop, product, options) → Promise<object> } }`.
- Produces: `fanOut.propagateStock(product, { exceptShopId?, onlyListingId? }) → Promise<object[]>`, `fanOut.pushProductChanges(product, changes) → Promise<object[]>` — same return values as today's manager methods.
- In this task each shop's `app` delegates to today's shared manager/routes (bridge), so behaviour is identical; Tasks 2–4 replace the bridge.

- [ ] **Step 1: Write failing tests**
  - `app-contract.test.js` — `every adapter exposes app with api, sync and catalog`: for each `registry.KEYS`, `typeof app.api === 'function'`, `sync.orders/listings/access/full` are functions, `sync.inbox` is a function iff `capabilities.inbox`, `catalog.pushStock/pushChanges/publish` are functions.
  - `fanout.test.js` — `fan-out pushes stock to every other shop's listing`: stub `Listing.find` → listings on ebay (shop A) and temu (shop B) for product P; stub each app's `catalog.pushStock` to record calls; `propagateStock(P, { exceptShopId: A })` → only temu's `pushStock` called with listing B. `product changes reach each listing through its own shop`: `pushProductChanges(P, { price: 9 })` → each listing's own shop's `pushChanges` called once with `{ price: 9 }`; results array length 2.
  - `sync-dispatch.test.js` — `scheduler runs the shop's own sync job`: stub `Shop.findById` → connected temu shop; `runJob('orders', id)` calls `registry.get('temu').app.sync.orders(shop)` exactly once and no other shop's.
  - `no-shop-branches.test.js` — add case `shop folders never require another shop's folder` (scan `marketplaces/<key>/**/*.js` for `require('…/marketplaces/<other>/…')` or `'../<other>/'`).
- [ ] **Step 2: Run** `node --test test/app-contract.test.js test/fanout.test.js test/sync-dispatch.test.js` — Expected: FAIL (`app` undefined, `fanOut` missing).
- [ ] **Step 3: Implement** the bridge `app/index.js` per shop (delegating to `marketplaceManager` methods and `require('../api')`), `fanOut.js` (move `propagateStock`/`pushProductChanges` loop from the manager; per listing call `registry.get(listing.marketplace).app.catalog.*`), point `syncQueue` KINDS and the three callers at them; adapter `get app() { return require('./app') }`.
- [ ] **Step 4: Run** `npm test` — Expected: all pass, `routes.json` snapshot unchanged.
- [ ] **Step 5: Commit + push** `git commit -m "Shops get an app (api, sync, catalog); stock/price fan-out goes through each listing's own shop"`.

---

### Task 2: eBay owns its backend logic

**Files:**
- Create: `backend/marketplaces/ebay/app/{api.js,routes/*,services/*,sync/*,test/*}` (copies of today's shared files, trimmed to eBay)
- Modify: `backend/marketplaces/ebay/app/index.js` (bridge → own code), `backend/marketplaces/ebay/index.js` (`api` getter → `app.api`), delete `backend/marketplaces/ebay/api.js`
- Test: `backend/marketplaces/ebay/app/test/{orders,catalog,analytics,sections,inbox,routes}.test.js`

**Interfaces:**
- Consumes: Task 1 `app` shape; shared `middleware/shopScope.onlyShop('ebay')`, `belongsToShop`; `services/marketplace/connection.withShopToken`.
- Produces: `registry.get('ebay').app` fully implemented by eBay code.

**Trimming rules (all shop tasks):** inside the copy, `registry.get(shop.marketplace)` / `getService(marketplace)` become the shop's own adapter/service (`require('../../index')`, `require('../../service')`); known `capabilities.*` and `hooks?.*` checks for this shop are folded to the branch that runs (e.g. eBay: `capabilities.inbox === true`, `hooks.publishedSku` called directly, TikTok-only `hooks.analytics` branch removed); `marketplace` query/body reads become the literal key; queries add `marketplace: 'ebay'` where they filtered by the request's marketplace. No other shop's name may remain.

- [ ] **Step 1: Write failing tests** — copy `test/sales.service.test.js`, `test/catalog.service.test.js`, `test/analytics.service.test.js`, `test/shops.service.test.js` (section cases) into `ebay/app/test/` targeting `../services/*`, with eBay fixtures only; add `ebay/app/test/routes.test.js` — `eBay API routes are the same as before`: `require('../api').routeList` deep-equals `routes.json` `perShop.ebay`; and `eBay services never read another shop's rows`: every stubbed `Order/Listing/Customer.find` query issued by `orders.list`, `customers.list`, `analytics.summary` contains `marketplace: 'ebay'` or a `shopId` filter.
- [ ] **Step 2: Run** `node --test marketplaces/ebay/app/test/` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** — copy files per the file structure and apply the trimming rules; wire `app/index.js` to the own `api`, `sync.*` (eBay parts of `syncOrdersForShop`, `syncListingsForShop`, `syncInboxForShop`, `saveSyncedListing`, `reconcileStock`), `catalog.*` (eBay `pushStock`/`pushProductChanges` per listing, `publishListing`).
- [ ] **Step 4: Run** `npm test` and `../frontend/node_modules/.bin/oxlint -c .oxlintrc.json .` — Expected: all pass, 0 warnings, `routes.json` unchanged.
- [ ] **Step 5: Commit + push** `git commit -m "eBay owns its backend: routes, services and sync in marketplaces/ebay/app"`.

---

### Task 3: TikTok Shop owns its backend logic

Same as Task 2 with `tiktok_shop` / `/api/tiktok`: TikTok keeps `hooks.analytics` (its own sales figures) inline in `app/services/analytics.js`, its package label/ship in `app/services/sections.js`, and inbox. Tests in `backend/marketplaces/tiktok_shop/app/test/` incl. `routes.test.js` against `perShop.tiktok_shop`.
- [ ] Steps 1–5 as Task 2. Commit: `"TikTok Shop owns its backend: routes, services and sync in marketplaces/tiktok_shop/app"`.

---

### Task 4: Temu owns its backend logic

Same as Task 2 with `temu`: no inbox routes, service or sync job (`sync.inbox` absent); approve-only returns. Tests in `backend/marketplaces/temu/app/test/` incl. `routes.test.js` against `perShop.temu` and `Temu app has no inbox` (`app.sync.inbox === undefined`, no route under `/inbox`).
- [ ] Steps 1–5 as Task 2. Commit: `"Temu owns its backend: routes, services and sync in marketplaces/temu/app"`.

---

### Task 5: Remove the shared shop logic; shared code reaches shops only through `app`

**Files:**
- Delete: `backend/routes/shop/`, `backend/services/sales/{orders,customers,customerStats}.js`, `backend/services/catalog/{products,inventory,productImport}.js`, `backend/services/analytics/reports.js`, `backend/services/inbox/inboxBot.js`, section parts of `backend/services/system/shops.js`, `backend/services/marketplace/{sections,sectionKit,listingKeys}.js` once unused, and the shared tests that targeted them (moved in Tasks 2–4)
- Rename: `backend/services/marketplace/index.js` → `backend/services/marketplace/connection.js`, keeping only OAuth/tokens/access/profiles/connect/autoConnect; update its callers (`server.js`, `routes/system/shops.js`, `services/system/shops.js`, webhooks, scripts)
- Modify: `backend/services/research/reports.js` (publish/relist via `registry.get(key).app.catalog.publish`)
- Modify: `backend/marketplaces/README.md`, `docs/restructure-plan.md`
- Test: `backend/test/research.service.test.js` (+ case), `backend/test/no-shop-branches.test.js` (+ case)

**Interfaces:**
- Consumes: complete `app` on all three adapters (Tasks 2–4).

- [ ] **Step 1: Write failing tests** — `research lists through the shop's app`: stub `registry.get('temu').app.catalog.publish` and call the research list-on-shop path for a temu opportunity → called once with the product; `shared backend code holds no shop logic`: scanning `services/`, `routes/` finds no `require` of `routes/shop` or of the deleted services, and `services/marketplace/connection.js` exports no `sync*`/`push*`/`propagate*` methods.
- [ ] **Step 2: Run** `npm test` — Expected: the two new tests FAIL.
- [ ] **Step 3: Implement** the deletions, rename and research change; update READMEs (adapter `app` member, per-shop folders, what stays shared).
- [ ] **Step 4: Run** `npm test`, backend lint, and `cd ../frontend && npm test && npm run build` — Expected: all pass; `routes.json` unchanged; frontend untouched.
- [ ] **Step 5: Commit + push** `git commit -m "Shared backend keeps only infrastructure; shop logic lives in each shop's app"`.

---

## After execution (user)

Deploy `git pull && docker compose up -d --build backend`, then per shop: orders sync and order actions, product list/edit/publish, a sale on one shop lowering stock on another shop's listing, inbox (eBay, TikTok), returns/promotions/offers/fulfillment, Market research "List on shop".
