# Per-shop Products, Stock and Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every product belongs to one shop, so stock, price and listing fields are separate per shop; existing data is split by a safe, user-run migration.

**Architecture:** `Product` gains `marketplace`; each shop's app (`backend/marketplaces/<key>/app/`) reads, creates, matches and updates only products of its own key and pushes changes only to its own listings, so the cross-shop fan-out is deleted. A migration script splits existing products per shop and repoints listings, order items, inventory logs and research links.

**Tech Stack:** Node 24, Express 5, Mongoose, node:test, oxlint.

**Spec:** `docs/superpowers/specs/2026-11-24-per-shop-stock-design.md`

## Global Constraints

- Commit and push directly to `main` (user rule). Push after each task.
- API paths unchanged; `test/__snapshots__/routes.json` must not change. Product JSON only gains `marketplace`.
- Never run anything against the production database. The migration is written and tested with stubs; the user runs it (`docker compose exec backend node scripts/split-products-per-shop.js [--apply]`).
- A shop's code never reads or writes another shop's products: every `Product` query in `marketplaces/<key>/app/` includes `marketplace: '<key>'` (or works on a document already loaded with that filter).
- Shop folders never require another shop's folder (existing guard test stays green).
- Behaviour within one shop unchanged: order sync still lowers that shop's product stock, inventory adjust still pushes to that shop's listing, notifications and cache groups unchanged.

## Review Focus

1. An eBay order for an item also sold on TikTok lowers only the eBay product; TikTok's product and listing are untouched → Task 2 test `a sale lowers only this shop's product`.
2. A TikTok listing sync item with the same SKU as an eBay product creates/matches TikTok's own product, never the eBay one → Task 2 test `listing sync matches only this shop's products`.
3. Editing price/stock in one shop's products page pushes only to that shop's listing → Task 2 test `a product edit pushes only to this shop's listing`.
4. Migration of a product listed on two shops with orders, logs and a research link: two products, every reference repointed, second run changes nothing → Task 1 tests `splits a product listed on two shops` and `a second run changes nothing`.
5. `/api/ebay/products/:id` with a TikTok product id answers 404 → Task 2 test `another shop's product id is a 404`.

---

### Task 1: Product belongs to a shop; split migration (planner + script)

**Files:**
- Modify: `backend/models/Product.js` (add `marketplace: { type: String, enum: KEYS, index: true }`; replace `productSchema.index({ sku: 1 }, { unique: true })` with `productSchema.index({ marketplace: 1, sku: 1 }, { unique: true })`)
- Create: `backend/scripts/splitProducts.js` (pure planner), `backend/scripts/split-products-per-shop.js` (runner)
- Modify: `backend/package.json` (script `split-products`), `backend/test/scripts.test.js` expectations if it counts scripts
- Test: `backend/test/split-products.test.js`

**Interfaces:**
- Produces: `planSplit({ products, listings, orders, logs, reports, shops }) → { assign: [{ productId, marketplace }], copies: [{ fromId, newId, marketplace, stock, price }], repoint: { listings: [[listingId, productId]], orderItems: [[orderId, itemIndex, productId]], logs: [[logId, productId]], reports: [[reportId, oppIndex, productId]] } }` — pure, no database. Ids are strings; `newId` comes from an injected `makeId()`.
- Produces: `Product.marketplace` (string key) for Tasks 2–4.

- [ ] **Step 1: Write failing tests** in `test/split-products.test.js`:
  - `splits a product listed on two shops`: product P (stock 10, basePrice 20, sku S1) with an eBay listing (stock 4, price 19) and a TikTok listing (stock 7, price 21), one eBay order item and one TikTok order item for P, an inventory log on the TikTok shop, a research opportunity (targetMarketplace `tiktok`) with `addedProductId: P` → P assigned to `ebay` with stock 4 / price 19; one copy for `tiktok_shop` with stock 7 / price 21; the TikTok listing, TikTok order item, TikTok log and the research link repoint to the copy; eBay ones stay on P.
  - `an unlisted product goes to its target shop`: `attributes.targetMarketplace: 'temu'`, no listings → assigned `temu`, no copies.
  - `a product with no shop is copied to every shop`: no listings, no target → assigned `ebay`, copies for `tiktok_shop` and `temu` with its own stock/price.
  - `a second run changes nothing`: products that already have `marketplace` → empty `assign`, `copies`, `repoint`.
  - `the runner only writes with --apply and backs up first`: stub models; without `--apply` no `create/updateOne/bulkWrite` calls; with `--apply` the backup writer is called before the first write and the old `sku_1` index is dropped once.
  - `products are unique per shop, not overall` (schema): `Product.schema.indexes()` contains `[{ marketplace: 1, sku: 1 }, { unique: true }]` and no unique `{ sku: 1 }`.
- [ ] **Step 2: Run** `node --test test/split-products.test.js` — Expected: FAIL (module missing, index unchanged).
- [ ] **Step 3: Implement** the model change, `planSplit` (first shop in registry order among the product's listing shops keeps the original id), and the runner: connect via `config/db`, load the collections, call `planSplit`, print a summary (products assigned, copies, references repointed per collection); with `--apply`: write `backups/split-products-<ISO time>/<collection>.json` for products, listings, orders, inventorylogs, researchreports, then insert copies, set `marketplace`/stock/price, apply repoints with `bulkWrite`, `dropIndex('sku_1')` if present, `syncIndexes()`.
- [ ] **Step 4: Run** `npm test` — Expected: all pass, `routes.json` unchanged.
- [ ] **Step 5: Commit + push** `"Products belong to one shop; migration script splits shared products per shop"`.

---

### Task 2: eBay works only with eBay products

**Files:**
- Modify: `backend/marketplaces/ebay/app/services/{products,inventory,analytics,inbox,customerStats}.js`, `backend/marketplaces/ebay/app/manager.js`, `backend/marketplaces/ebay/app/routes/products.js`
- Test: `backend/marketplaces/ebay/app/test/stock.test.js`, extend `backend/marketplaces/ebay/app/test/catalog.test.js`

**Interfaces:**
- Consumes: `Product.marketplace` (Task 1).
- Produces: `app.catalog` keeps `publish`, `listingAction`, `capabilities`, `remember`; `pushStock`, `pushChanges`, `relist` are removed (Task 5 deletes the fan-out that used them).

**Rules for every shop task:** every `Product` read/write in the app adds `marketplace: '<key>'` (list: replace the listing/targetMarketplace product filter with `{ marketplace: '<key>' }`; create/import/sync-create set it); `router.param('id', belongsToShop(() => Product, '<key>', 'Product'))` on the products routes; listing/order sync match products by SKU/aliases **within** `marketplace: '<key>'`; a sale updates this product's stock and, if the product has other listings **on this shop**, pushes to them through the own manager (`pushStockOne`); a product edit or inventory adjust pushes through the own manager to this shop's listings only (`reviseOne`, and `relistOne` on restock for eBay). Remove every `fanOut` require/call.

- [ ] **Step 1: Write failing tests** in `ebay/app/test/stock.test.js` (stubbed models; eBay manager/services):
  - `a sale lowers only this shop's product`: order sync with one eBay order for SKU S1 where an eBay product (stock 5) and a TikTok product (stock 5) both have SKU S1 → only the eBay product's stock becomes 4; no update touches the TikTok product; no fan-out module is required.
  - `listing sync matches only this shop's products`: `saveSyncedListing` for an eBay item with SKU S1 when only a TikTok product has SKU S1 → creates a new product with `marketplace: 'ebay'`.
  - `a product edit pushes only to this shop's listing`: `products.update` changing price → own `reviseOne` called for the eBay listing only.
  - extend `catalog.test.js`: `list filters by this shop's products` (`seen.productFilter.marketplace === 'ebay'`) and `create stamps the product with this shop` (`seen.created.marketplace === 'ebay'`).
  - extend `routes.test.js`: `another shop's product id is a 404` (`belongsToShop` param on `/products/:id`).
- [ ] **Step 2: Run** `node --test marketplaces/ebay/app/test/*.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per the rules above.
- [ ] **Step 4: Run** `npm test` and backend lint — Expected: all pass, 0 warnings, `routes.json` unchanged.
- [ ] **Step 5: Commit + push** `"eBay works only with eBay products: stock, price and matching per shop"`.

### Task 3: TikTok Shop works only with TikTok Shop products
Same as Task 2 for `tiktok_shop` (tests in `tiktok_shop/app/test/`; TikTok keys listings by product key — `productKeyListings` — so matching stays within `marketplace: 'tiktok_shop'`). Commit `"TikTok Shop works only with TikTok Shop products"`.

### Task 4: Temu works only with Temu products
Same as Task 2 for `temu` (no relist, no inbox). Commit `"Temu works only with Temu products"`.

---

### Task 5: Remove the cross-shop fan-out; shared code per shop

**Files:**
- Delete: `backend/services/catalog/fanOut.js`, `backend/test/fanout.test.js`
- Modify: `backend/marketplaces/contract.js` (catalog shape), `backend/test/app-contract.test.js`, `backend/marketplaces/*/app/index.js` (drop `pushStock/pushChanges/relist`), `backend/services/research/reports.js` (add-to-catalog creates the product with `marketplace` = the chosen shop; relist/finds use that shop's product), `backend/services/productAccess.js` (product scope includes `marketplace` when given), docs (`backend/marketplaces/README.md`, `docs/restructure-plan.md`), deploy runbook in `docs/superpowers/specs/2026-11-24-per-shop-stock-design.md`
- Test: `backend/test/research.service.test.js` (+ `add to catalog creates the product for the chosen shop`), `backend/test/no-shop-branches.test.js` (+ `no cross-shop fan-out remains`)

- [ ] **Step 1: Write failing tests** — research add-to-catalog for a `temu` opportunity creates a product with `marketplace: 'temu'`; no file under `backend/` requires `services/catalog/fanOut` and the file is gone; contract test: `catalog` has `publish, listingAction, capabilities, remember` and no `pushStock`.
- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the deletions and changes; write the runbook (pause sync → deploy → `node scripts/split-products-per-shop.js` dry run → `--apply` → resume sync).
- [ ] **Step 4: Run** `npm test`, backend lint, `cd ../frontend && npm test && npm run build` — Expected: all pass, `routes.json` unchanged.
- [ ] **Step 5: Commit + push** `"No cross-shop stock fan-out: each shop's products are its own"`.
