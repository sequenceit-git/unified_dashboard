# Shop Section Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each shop's sections are named after that shop's own API (eBay `listings`, Temu `goods`, TikTok `packages`, …) in folders, URLs, API paths and stored ids.

**Architecture:** A per-shop rename table drives everything: backend profiles, section loaders, app API groups and permission checks use the new ids; each adapter keeps a `renamedSections` map (old → new) used for old-URL redirects, notification links and the data migration that renames stored sub-admin permissions and shop API-access keys.

**Tech Stack:** Node 24, Express 5, Mongoose, React + Vite, node:test.

**Spec (decisions, 2026-11-24, user answered "yes all"):** rename everywhere — folders, URLs, API paths, stored ids (Q1 a); names exactly as in the table below (Q2); plan → native execution → final review; migration `npm run rename-sections`, dry run by default, `--apply` with backup, same deploy with sync paused (Q3).

## Global Constraints

- Rename table (old → new), only these change:
  - `ebay`: products→`listings`, finances→`payouts`, customers→`buyers`, returns→`returns-cases`, inbox→`messages`
  - `tiktok_shop`: fulfillment→`packages`, finances→`finance`, content→`videos-live`, returns→`returns-cancellations`, inbox→`customer-service`
  - `temu`: products→`goods`, fulfillment→`shipping`, prices→`price-reviews`, returns→`after-sales`
- Main-route permissions (`config/access.js` MAIN_ROUTES: products, orders, inbox, customers, …) are app-wide and do **not** change; a section's `route` keeps naming them.
- Old URLs keep working: `/<shop>/<old id>` and the older `?shop=` forms redirect to the new id.
- `test/__snapshots__/routes.json` and `profiles.json` change only as the rename table implies (regenerate on purpose, diff checked).
- Push directly to `main` after each task. Never touch the production database; the user runs the migration.

## Review Focus

1. A sub-admin allowed `ebay:products` (or the bare `products`) can open eBay Listings after the migration → Task 2 test `stored permissions follow the rename`.
2. An old bookmark `/temu/products` or `/products?shop=temu` lands on `/temu/goods` → Task 3 test `old section URLs redirect to the new names`.
3. A low-stock notification for an eBay product links to `/ebay/listings` → Task 1 test `notification links use the shop's section names`.
4. Sections stay unlocked after the deploy: stored `Shop.apiAccess.products` becomes `apiAccess.listings` → Task 2 test `shop access keys follow the rename`.
5. The router's permission gate still uses the main route (`products`), not the new id (`listings`) → Task 3 test `section pages are gated by their main route`.

---

### Task 1: Backend uses the shops' own section names

**Files:** `backend/marketplaces/<key>/profile.js` (section `id`s; `path` → `/<urlId>/<id>`), `backend/marketplaces/<key>/sections/` (rename files `finances.js`→`payouts.js` etc.; `index.js` keys), `backend/marketplaces/<key>/index.js` (add `renamedSections: { <old>: '<new>' }`), `backend/marketplaces/<key>/app/api.js` (group names: eBay `listings`, `buyers`, `messages`; TikTok `customer-service`; Temu `goods`), `backend/marketplaces/<key>/app/routes/*.js` (`limitToSection` / `sectionGuard` ids), `backend/marketplaces/<key>/app/services/sections.js` (section-id checks), `backend/services/core/notify.js` (`shopPath(role, marketplace)` → `/<urlId>/<renamedSections[role] || role>`), snapshots, the shops' app tests.

- [ ] **Step 1: Failing tests** — `test/section-names.test.js`: `each shop's section ids follow its API` (profile ids equal the expected per-shop lists after the rename table); `notification links use the shop's section names` (notify `shopPath('/products', 'ebay') === '/ebay/listings'`, `('/inbox','tiktok_shop') === '/tiktok/customer-service'`, `('/orders','temu') === '/temu/orders'`); `each shop's API uses its section names` (eBay routeList has `GET /listings` and no `/products`; Temu has `GET /goods`; TikTok has `/customer-service/conversations`).
- [ ] **Step 2: Run** — Expected FAIL.
- [ ] **Step 3: Implement**; regenerate `routes.json` and `profiles.json` (delete + rerun) and check the diff only renames.
- [ ] **Step 4: Run** `npm test` + backend lint — all pass.
- [ ] **Step 5: Commit + push** `"Backend sections use each shop's own API names"`.

### Task 2: Migration renames stored permissions and access keys

**Files:** create `backend/scripts/renameSections.js` (pure `planRename({ users, shops })` + `run({ apply, db, log })`), `backend/scripts/rename-sections.js` (runner, JSON backup of users/shops to `/app/backups/rename-sections-<time>/`, prints `docker cp`), `backend/package.json` (`rename-sections`).

**Interfaces:** `planRename({ users, shops }) → { users: [[userId, allowedSections]], shops: [[shopId, apiAccess]] }` using each adapter's `renamedSections`.

- [ ] **Step 1: Failing tests** `test/rename-sections.test.js`: `stored permissions follow the rename` (`['ebay:products','temu:fulfillment','orders','returns']` → `['ebay:listings','temu:shipping','orders','returns','ebay:returns-cases','tiktok_shop:returns-cancellations','temu:after-sales']` — a bare id keeps its old value for shops that didn't rename it and gains `<shop>:<new>` for each shop that did); `shop access keys follow the rename` (temu `{ products: {ok:true}, orders: {...} }` → `{ goods: {ok:true}, orders: {...} }`); `a second run changes nothing`; `the runner writes only with --apply, after a backup`.
- [ ] **Steps 2–5** as usual; commit `"Migration renames stored section permissions and access keys"`.

### Task 3: Frontend folders, pages, URLs and API calls use the new names

**Files:** `frontend/src/marketplaces/<key>/sections/<old>/` → `<new>/` (page component renamed, e.g. `ListingsPage`, `AfterSalesPage`), `frontend/src/marketplaces/<key>/index.js` (`subsections` ids, `pages` keys, `renamedSections`), API paths in each shop's pages (`/api/ebay/listings`, `/api/temu/goods`, `/api/<shop>/sections/<new id>`), `frontend/src/App.jsx` (gate by the subsection's `route`; redirect `/<urlId>/<old>` → `/<urlId>/<new>`), `frontend/src/components/LegacyShopRedirect.jsx` (map old ids), `frontend/src/components/ShopSectionGate.jsx` (route-based permission), tests.

- [ ] **Step 1: Failing tests** (`frontend/test/registry.test.mjs`): `section folders, pages and sidebar ids use each shop's names` (exact id lists per shop; folder names equal page keys); `old section URLs redirect to the new names` (pure `renamedPath('/temu/products') === '/temu/goods'`, `('/ebay/inbox') === '/ebay/messages'`, unchanged ids return null); `section pages are gated by their main route` (App's gate for eBay `listings` uses route `products`).
- [ ] **Steps 2–5**: implement, `npm test` + build; commit `"Frontend sections use each shop's own names; old URLs redirect"`.

### Task 4: Docs and runbook
Update `backend/marketplaces/README.md`, `frontend/src/marketplaces/README.md`, and add the rename to the per-shop-stock runbook (both migrations in the same deploy with `SYNC_PAUSED=true`: `split-products` then `rename-sections`, dry run then `--apply`). Commit `"Docs: shop section names and runbook"`.
