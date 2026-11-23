# Shop API Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A checked list of every official seller API endpoint of eBay, TikTok Shop and Temu, marked covered or missing against the dashboard's actual API calls, with a ranked gap list per shop to implement next.

**Architecture:** A small extractor reads the API calls the code makes (`backend/marketplaces/<key>/`); researched catalogs (one JSON per shop, built from the official docs with source URLs) list every endpoint; a comparer joins them into coverage rows; hand-written gap notes (section, value, size) annotate every missing seller endpoint; tests guard the data; a report page and README present it.

**Tech Stack:** Node 24 scripts + node:test (backend), JSON data in `docs/api-coverage/`, an Artifact page for the report.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-coverage-design.md`

## Global Constraints

- Official references only; every catalog lists its source URLs. Temu endpoints not confirmable publicly get `confirmed: false` ("confirm in partner account"), never invented.
- "Covered" means called from `backend/marketplaces/<key>/` (non-test code), found by the extractor.
- Buyer-side / non-seller endpoints are `sellerFacing: false` and never counted as gaps.
- No product code changes; new files only under `backend/scripts/apiCoverage/`, `backend/test/`, `docs/api-coverage/`.
- Push directly to `main` after each task.

## Data shapes (all tasks)

- Endpoint id: eBay REST `"<METHOD> /sell/analytics/v1/traffic_report"` (path params as `{name}`, no query); eBay Trading `"Trading:GetItem"`; TikTok `"<METHOD> /analytics/202405/shop_products/performance"`; Temu `"bg.local.goods.list.query"`.
- Catalog `docs/api-coverage/catalog/<key>.json`: `{ shop, sources: [url], researchedAt, endpoints: [{ id, group, name, summary, scope?, sellerFacing, confirmed }] }`.
- Gap notes `docs/api-coverage/gaps/<key>.json`: `{ [endpointId]: { section, value, size: 'small'|'medium'|'large' } }` — `section` is an existing section id of that shop (e.g. eBay `listings`) or `"new: <name>"`.

## Review Focus

1. We call a templated path (`/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`) and the catalog has `{orderId}` → must count as covered → Task 1/5 test `path parameters match whatever their names`.
2. We call an older TikTok version (`/product/202309/products/search`) while the catalog lists `202502` → shown as "covered (older version)", not missing → Task 5 test `an older API version counts as covered, flagged`.
3. eBay Buy APIs we use for imports (`/buy/browse/v1/item/get_item_by_legacy_id`) → covered and `sellerFacing: false`, never in the gap list → Task 5 test `buyer APIs are never gaps`.
4. Unconfirmed Temu endpoints → in the report as "confirm in partner account", not as plain gaps → Task 5 test `unconfirmed endpoints are flagged, not silent gaps`.
5. A catalog that misses an endpoint we actually call → fails loudly → Tasks 2–4 test `the catalog lists every endpoint we call`.

---

### Task 1: Extract the endpoints the dashboard calls

**Files:** create `backend/scripts/apiCoverage/used.js`, `backend/test/api-coverage.test.js`.

**Interfaces:** Produces `usedEndpoints(key: 'ebay'|'tiktok_shop'|'temu') → Array<{ id: string, files: string[] }>` (ids in the shapes above; `${...}` template parts and `:param` become `{param}`; query strings dropped; method taken from the call site when visible, else `ANY`), and `normalizeId(id) → string` (lowercases the method, replaces every `{…}` with `{}`) used by Task 5.

- [ ] **Step 1: Failing tests** — `the extractor finds known calls`: eBay includes `Trading:GetItem` and an id ending `/commerce/message/v1/send_message`; TikTok includes an id ending `/analytics/202405/shop_products/performance`; Temu includes `bg.aftersales.cancel.agree`; every `files` entry exists; ids unique. `path parameters match whatever their names`: `normalizeId('GET /sell/fulfillment/v1/order/{orderId}') === normalizeId('get /sell/fulfillment/v1/order/{order_id}')`.
- [ ] **Step 2–4:** run (FAIL) → implement (regexes per shop over non-test `.js` files) → run (PASS).
- [ ] **Step 5: Commit** `"API coverage: extract the endpoints each shop's code calls"`.

### Task 2: eBay catalog
**Files:** create `docs/api-coverage/catalog/ebay.json`; extend `backend/test/api-coverage.test.js`.
- [ ] **Step 1: Failing tests** (shared for all catalogs, parameterised by shop): `catalog <key> is well formed` (required fields, unique ids, ≥1 source URL, `researchedAt` ISO date); `the catalog lists every endpoint we call` (every `usedEndpoints(key)` id, normalized, is in the catalog — older TikTok versions excepted per Task 5).
- [ ] **Step 2:** run (FAIL: file missing).
- [ ] **Step 3: Research** the official reference pages and write the JSON: Sell APIs — Account, Analytics (incl. traffic report: views, impressions, CTR), Compliance, Feed, Finances, Fulfillment, Inventory, Logistics, Marketing, Metadata, Negotiation, Recommendation, Stores; Commerce — Catalog, Identity, Media, Message, Notification, Taxonomy, Feedback (if public); Post-Order; Trading API calls; Buy APIs the code uses (`sellerFacing: false`).
- [ ] **Step 4:** run (PASS). **Step 5:** commit `"API coverage: eBay catalog"`.

### Task 3: TikTok Shop catalog
Same as Task 2 for `tiktok_shop.json`: every API group in the Partner Center reference (Authorization, Seller, Product, Order, Fulfillment, Logistics, Return & Refund, Promotion, Finance, Customer Service, Analytics, Affiliate Seller, Supply Chain, Event/Webhook, Data reconciliation), latest version of each endpoint. Commit `"API coverage: TikTok Shop catalog"`.

### Task 4: Temu catalog
Same for `temu.json` from the Temu Partner Platform docs (goods, inventory, price, order, logistics/shipping, after-sales, promotion, ads, webhooks…); anything not confirmable publicly gets `confirmed: false`. Commit `"API coverage: Temu catalog"`.

### Task 5: Compare and annotate the gaps
**Files:** create `backend/scripts/apiCoverage/compare.js`, `docs/api-coverage/gaps/{ebay,tiktok_shop,temu}.json`; extend the test.

**Interfaces:** `coverage(catalog, used) → Array<{ id, group, name, summary, status: 'covered'|'covered-older'|'missing'|'not-for-sellers', confirmed, files }>` (TikTok: same path minus the `/YYYYMM/` version segment called at an older version → `covered-older`).

- [ ] **Step 1: Failing tests:** `an older API version counts as covered, flagged`; `buyer APIs are never gaps` (`sellerFacing:false` → `not-for-sellers` whether called or not); `unconfirmed endpoints are flagged, not silent gaps` (`confirmed:false` keeps `confirmed:false` on the row); `every missing seller endpoint has a gap note` (for each shop, each `missing` row's id is a key in `gaps/<key>.json` with a valid `size` and a `section` that is the shop's section id or starts with `new: `).
- [ ] **Steps 2–4:** run (FAIL) → implement `coverage` and write the gap notes (section, plain-language value to the seller, size) → run (PASS).
- [ ] **Step 5:** commit `"API coverage: compare and annotate the gaps"`.

### Task 6: Report
**Files:** create `backend/scripts/apiCoverage/report.js` (`npm run api-coverage` writes `docs/api-coverage/README.md`: per-shop summary counts, the gap list grouped by section and sorted by size, then the full catalog table) and an Artifact report page built from the same rows (per-shop tabs, filters for status / section / size).
- [ ] **Step 1: Failing test:** `the report lists every gap` (generated README contains each missing id).
- [ ] **Steps 2–4:** run → implement → run; publish the page.
- [ ] **Step 5:** commit `"API coverage: report"`.
