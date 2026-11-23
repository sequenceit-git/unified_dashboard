# Codebase Restructure Implementation Plan (shop modules + domain services)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each shop (eBay, TikTok Shop, Temu) its own folder in the backend and the frontend, holding all of that shop's code with one file per section. Move unified business logic out of route files into domain services. Clean up repo housekeeping. Throughout, the dashboard keeps working as one unified app with identical behaviour.

**Architecture:** A shared core (sync manager, cross-shop stock sync, queue, cache, models, unified pages) talks to each shop through one *adapter* object exported from `backend/marketplaces/<key>/index.js` and listed in a registry (`backend/marketplaces/index.js`). The frontend mirrors this with `frontend/src/marketplaces/<key>/` and its own registry. Code moves shop by shop (Temu → TikTok Shop → eBay), then the shared manager, routes and frontend stop branching on shop names. Route handlers become thin: database and business logic lives in `backend/services/<domain>/`, and infrastructure in `backend/services/core/`.

**Tech Stack:** Node 24 / Express 5 / Mongoose 9 (CommonJS), React 19 + Vite, `node --test` (built in, no new dependency), oxlint.

**Spec:** the *Decisions* section below (agreed 2026-11-23 in two grilling sessions: shop modules Q1–Q19, wider restructure Q1–Q13).

**Order of tasks:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 6a → 6b → 6c → 6d → 6e → 6f → 7 → 8 → 8a → 9

## Progress (2026-11-23)

| Task | Status | Commit |
|---|---|---|
| 0 Housekeeping | done | 495a370 |
| 1 Test suite | done | ff7df37 |
| 2 Registry + contract | done | f0af079 |
| 3 Temu → marketplaces/temu | done | 74a1c4c |
| 4 TikTok Shop → marketplaces/tiktok_shop | done | 1ad1723 |
| 5 eBay → marketplaces/ebay | done | 0d2f8bb |
| 6 Core without shop branches | done | a5373d9, 6612484 |
| 6a services/core | done | de2bf2a |
| 6b–6f domain services (catalog, sales, research, auth, analytics + shops) | done | 9884b53, 2b5650b, 1b16771, fb68870, d7c7c97 |
| 7 Frontend registry + section files | done | 3a42a95 |
| 8 Listing forms | done: shop parts in `listing/{listFields,productFields,draftFields}`, dialog logic in hooks | 1f62b37, 9b19e45 |
| 8a Big pages | done: every page component under 500 lines | 269c7db, 9b19e45 |
| 9 Docs and paths | done | (this commit) |

**Follow-ups done 2026-11-24:** TikTok analytics became `hooks.analytics` (9db4eba); two regressions found by the final review fixed (8ad47ea); a customer-drawer crash from Task 7 fixed (448167d); the listing dialogs and big pages finished (9b19e45), checked by rendering 29 screens before and after on a local test database (identical HTML); an older Temu Direct listing crash fixed (19c2bca). Clean-up afterwards: dead files (ListingsTab, evidence memory, retry helper, agent/index), the unused Vercel entry points and the already-run one-off repair scripts were deleted; the `cleanup:ebay` / `cleanup:temu` npm scripts went with them (git history keeps them).

**Shops fully separate (2026-11-24):** shop pages moved from shared `pages/` into `frontend/src/marketplaces/<key>/sections/<section>/` — one copy per shop, trimmed to that shop's code (no `isEbay`/`isTikTok` branches, no listing slots); routes `/<shop>/<section>` with redirects from the old `?shop=` URLs; guard tests stop one shop's folder from importing or naming another. The dashboard API followed: shop endpoints moved from `/api/orders`, `/api/products`, `/api/shops/sections/…` (with `?marketplace=`) to `/api/<shop>/orders`, `/api/<shop>/sections/…`, each shop exposing only its own groups (`backend/marketplaces/<key>/api.js`); the handlers and services stay shared (`routes/shop/`). Then the backend logic followed (plan `docs/superpowers/plans/2026-11-24-per-shop-backend.md`): each shop's routes, services and sync live in `backend/marketplaces/<key>/app/`; the shared `routes/shop/`, `services/{sales,analytics,inbox}` and the shop parts of `services/{catalog,system}` and the manager are gone (the manager's connection part is `services/marketplace/connection.js`). Finally products, stock and price became per shop (plan `docs/superpowers/plans/2026-11-24-per-shop-stock.md`): each product belongs to one shop, the cross-shop fan-out is gone, and `npm run split-products` splits existing data.

## Decisions (the spec)

1. One folder per shop on a shared core, backend and frontend. Not three apps.
2. Combined pages (Overview, Orders, Products/Catalog, Inventory, Customers, Analytics, Inbox) stay shared and pull shop pieces from shop folders. Shop-only pages live in the shop folder.
3. Section = sidebar entry under a shop. One file per section holds its tables (subsections) and actions.
4. Tests come first (`node --test`), with marketplace APIs stubbed.
5. Backend folder: `backend/marketplaces/<key>/{index.js, config.js, client.js, orders.js, listings.js, webhooks.js, profile.js, sections/, scripts/, test/}`. The shared core stays in `backend/services/marketplace/`.
6. Frontend folder: `frontend/src/marketplaces/<key>/{index.js, sections/, listing/, settings.jsx}`. `ShopSectionPage` becomes a generic shell.
7. Folder names equal database keys: `ebay`, `tiktok_shop`, `temu`.
8. Pure reorganisation: same URLs, responses, DB fields and screens. Bugs found along the way are noted and fixed in separate commits.
9. Incremental, one commit per task on `main`: housekeeping → tests → skeleton → Temu → TikTok Shop → eBay → shared core → core infra → domain services → frontend → listing forms → page splits → docs.
10. Shop routes keep their URLs. Handlers delegate to the adapter.
11. Adapter contract: a few required members plus optional ones. It is written once in the registry and checked at startup.
12. Shop config moves to `<key>/config.js`. `config/marketplaces.js` only collects them. Env var names don't change.
13. Shop scripts move to `<key>/scripts/`. npm script names don't change.
14. Tests live in `<key>/test/` plus `backend/test/` for the core. `npm test` runs all of them.
15. No re-export shims at old paths. Every import is updated in the same commit.
16. READMEs for both `marketplaces/` folders. Skill docs (`.agents/skills`, `.cursor/skills`) and `frontend/src/pages/README.md` get the new paths.
17. A registry replaces hardcoded shop lists and labels everywhere.
18. The Product Discovery agent (`backend/agent/discovery/`) keeps its structure. Only its imports change.
19. This file is the plan. Each task's commit ticks its boxes.
20. Subsections (tables + their actions) live inside their section's file. One file per section, not per subsection. *(confirmed 2026-11-23)*
21. Route files over ~300 lines (products, shops, research, auth, orders, analytics) hand their DB and business logic to `services/<domain>/`. Routes keep request parsing, permission checks and the response. Models stay in `models/`. Small route files are left alone.
22. `.agents/skills` is the only copy of the skill docs. `.cursor/skills` becomes a symlink to it (no Windows developers on this repo). The diverged eBay skill is merged by hand first.
23. `graphify-out/` goes into `.gitignore` and is removed from git (local copy kept).
24. A real `README.md` replaces the MERN-starter template: purpose, local setup, `.env` variable **names**, deploy steps, public domain, `npm test`, folder map. No server hostname, IPs, Atlas cluster names or secret values. Root docs move: `All_feature.md` → `docs/features.md`, `DESIGN.md` → `docs/design.md`, `discovery_agent_architecture.md` → `docs/discovery-agent.md`.
25. Pages over ~500 lines that aren't shop forms (`SubAdminManagementPage`, `SubAdminFormPage`, `ProductDiscoveryPage`) become a page folder with `components/` and `hooks/`.
26. JSDoc types + `// @ts-check` only on `marketplaces/contract.js`, `marketplaces/index.js` and each `marketplaces/<key>/index.js`. No TypeScript migration.
27. Everything above is one plan, in this order: housekeeping first; JSDoc in Task 2; domain services after Task 6; page splits after Task 8.
28. Domain-service tests stub the models with the Task 1 helper, plus the route snapshot. No `mongodb-memory-server`.
29. Domain order: catalog → sales → research → auth → analytics, one commit each.
30. Existing loose services join their domain: `productImport`, `excelExport` → catalog; `customerStats` → sales; `inboxBot` → inbox; `aiSettings` → system. `cache`, `redis`, `syncQueue`, `events` and `notify` → `services/core/`, in their own task first. `services/marketplace/` stays as the shared sync core.
31. Shop helpers leave `utils/`: `utils/marketplace.js` becomes `registry.canonical()` (file deleted); `utils/listingUrl.js` becomes `adapter.listingUrl(listing)`; `ebaySku` moves into `marketplaces/ebay/`. Generic utils stay.

## Target layout

```
backend/
├── marketplaces/
│   ├── index.js            registry (KEYS, get, all, labels, canonical, assertAdapters)
│   ├── contract.js         REQUIRED / OPTIONAL members, checkAdapter  (@ts-check)
│   ├── ebay/          index · config · client · trading · orders · listings · inbox · finance
│   │                  webhooks · accountDeletion · hooks · profile · sku
│   │                  sections/{returns,offers,promotions,finances,index}.js · scripts/ · test/
│   ├── tiktok_shop/   index · config · client · orders · listings · promotions · finance · inbox
│   │                  analytics · webhooks · profile
│   │                  sections/{returns,fulfillment,promotions,finances,content,creators,index}.js · scripts/ · test/
│   └── temu/          index · config · client · orders · listings · webhooks · profile
│                      sections/{returns,fulfillment,prices,promotions,ads,index}.js · scripts/ · test/
├── services/
│   ├── marketplace/        shared sync core: index (manager), profiles, sections, sectionKit
│   ├── core/               cache · redis · syncQueue · events · notify
│   ├── catalog/  sales/  inbox/  research/  auth/  analytics/  system/
├── routes/                 thin; same URLs
├── models/ middleware/ utils/ agent/discovery/ config/ test/
frontend/src/
├── marketplaces/
│   ├── index.js            registry (MARKETPLACES, labels, colors, getShop)
│   ├── ebay/          index · settings.jsx · sections/{returns,offers,promotions,fulfillment}.jsx
│   │                  listing/{Fields.jsx,validate.js,rules.js,BestOfferField.jsx,IdentifierField.jsx}
│   ├── tiktok_shop/   index · settings.jsx · sections/{returns,promotions,fulfillment}.jsx
│   │                  listing/{Fields.jsx,validate.js,rules.js,IdentifierCodeField,CertificationFields,SizeChartField,BrandPicker}
│   └── temu/          index · settings.jsx · sections/returns.jsx · listing/{Fields.jsx,validate.js}
├── pages/   (shared pages; sub-admins/ and discovery/ split into components/ + hooks/)
├── components/ hooks/ lib/
```

Exact file lists per shop follow the section ids in each shop's profile at move time. The test in Task 1 snapshots them.

## Global Constraints

- Shop keys, folder names and DB values are exactly `ebay`, `tiktok_shop`, `temu`.
- These never change: HTTP routes (method + path), JSON response shapes, Mongo field names, `.env` variable names, npm script names (`smoke:ebay`, `smoke:temu`, `smoke:tiktok`, `cleanup:ebay`, `cleanup:temu`, `encrypt-recipient-pii`, `seed`).
- No new runtime or dev dependencies. Tests use `node:test` and `node:assert/strict`.
- No file may remain at an old path that only re-exports the new one.
- Each task ends with `cd backend && npm test` passing, `cd frontend && npm run build` succeeding, and `node --check` clean on every touched backend file. Then commit and push to `main` (no branches or PRs; project rule).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Production runs `docker compose up -d --build backend` (sync runs inside the backend; there is no worker container). Scripts run as `docker compose exec backend npm run <script>`.

## Review Focus

1. **Webhook raw bodies after the move.** `server.js` captures `req.rawBody` by `req.originalUrl` prefix (`/api/ebay/deletion`, `/api/tiktok/webhooks`). A moved webhook handler must still get the same bytes, and signatures must still verify. Pinned by the route tests in Task 1, re-run in Tasks 3–6.
2. **Startup contract check.** It must throw for a missing *required* member and never for a missing *optional* one. Otherwise production crashes on boot. Pinned in Task 2.
3. **Circular requires.** The registry, manager, syncQueue and webhooks reference each other (today through lazy `require` inside functions). A cycle gives `{}` exports and "x is not a function" only at runtime. Pinned in Task 2 (each adapter loads in a fresh process) and in each move task.
4. **Script entry points in the container.** `npm run smoke:temu` and the others must resolve after the move, including `require('../...')` paths inside the scripts. Pinned by the `scripts resolve` test in Task 1, extended per move task.
5. **Profiles and sections output stays the same.** Sidebar entries, section ids, routes, statuses and productForm for each shop must be identical, or sub-admin permissions and menus silently change. Pinned by the profile snapshot test in Task 1.

---

### Task 0: Housekeeping

**Files:**
- Modify: `.gitignore` (add `graphify-out/`); run `git rm -r --cached graphify-out`
- Merge: `.cursor/skills/ebay-shop-api/SKILL.md` into `.agents/skills/ebay-shop-api/SKILL.md` (keep every fact either side has; on a conflict, the newer statement wins). Check the other skills with `diff -rq .agents/skills .cursor/skills` and merge any other differences the same way. Then `git rm -r .cursor/skills && ln -s ../.agents/skills .cursor/skills && git add .cursor/skills`.
- Move: `git mv All_feature.md docs/features.md`, `git mv DESIGN.md docs/design.md`, `git mv discovery_agent_architecture.md docs/discovery-agent.md`, `(plan already saved as docs/restructure-plan.md; commit it here)`. Fix links in any file that references the old names (`grep -rn "All_feature\|DESIGN.md\|discovery_agent_architecture" --exclude-dir=node_modules .`).
- Rewrite: `README.md`. Sections: *What it is*, *Stack*, *Local setup* (`npm run install:all`, `npm run dev`), *Environment variables* (every `process.env.X` name found by `grep -rhoE "process\.env\.[A-Z0-9_]+" backend frontend/src | sort -u`, grouped by area, names only), *Deploy* (VPS + Docker Compose + Traefik, MongoDB Atlas, Redis with sync running inside `backend`; `git pull && docker compose up -d --build backend`; `docker compose exec backend npm run smoke:<shop>`), *Tests* (`cd backend && npm test`), *Folder map* (the Target layout above, marked "target until the restructure finishes"), *Docs* (links into `docs/`). The public domain may appear; hostnames, IPs, cluster names and secret values must not.

- [ ] **Step 1: Make the changes above.**
- [ ] **Step 2: Verify.** `git ls-files graphify-out | wc -l` → `0`; `ls graphify-out/graph.json` → still exists locally; `readlink .cursor/skills` → `../.agents/skills`; `ls .cursor/skills/temu-shop-api/SKILL.md` → resolves. `grep -nE "srv[0-9]|mongodb\+srv://|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" README.md` → no hits.
- [ ] **Step 3: Commit and push.** `"Housekeeping: ignore graphify-out, single skills copy, real README, docs folder"`

### Task 1: Test harness and characterisation tests

**Files:**
- Create: `backend/test/helpers/stub.js`, `backend/test/profiles.snapshot.test.js`, `backend/test/routes.snapshot.test.js`, `backend/test/scripts.test.js`, `backend/test/temu.webhooks.test.js`, `backend/test/temu.actions.test.js`, `backend/test/tiktok.webhooks.test.js`, `backend/test/ebay.notifications.test.js`, `backend/test/__snapshots__/profiles.json`, `backend/test/__snapshots__/routes.json`
- Modify: `backend/package.json` (add `"test": "node --test"`; `node --test` finds `**/*.test.js`)

**Interfaces:**
- Produces: `stubModules(map: Record<string, any>): () => void` in `test/helpers/stub.js`. It patches `Module._load` so a `require(request)` whose request **ends with** a key returns the mapped value, and returns a restore function. Every later task's tests use it.
- Produces: `freshRequire(absPath)`, which clears `require.cache` for the backend tree and then requires the path.

- [ ] **Step 1: Write the snapshot tests.**
  - `profiles.snapshot.test.js` → test `profiles match snapshot`: for each key of `PROFILES` (`services/marketplace/profiles.js`), project `{ label, sections: sections.map(({id,label,path,route,needs}) => ...), statuses, productForm }` and `deepStrictEqual` it with `__snapshots__/profiles.json`. If the snapshot file is missing, write it and pass (first run only).
  - `routes.snapshot.test.js` → test `routes match snapshot`: build the method+path list from `router.stack` of `routes/system/shops.js` and `routes/system/api.js` (stub `models/*`, `services/marketplace`, `services/cache`, `services/syncQueue`). Compare with `__snapshots__/routes.json`, which records the 26 shops.js routes listed in this plan's research plus api.js.
  - `scripts.test.js` → test `every npm script file exists`: for each `scripts` entry in `backend/package.json` that starts with `node `, `fs.existsSync` the file and run `node --check` on it.
- [ ] **Step 2: Write the behaviour tests.** Port the throwaway tests from the 2026-11-23 session (scratchpad `temu-wh-test.js`, `temu-actions-test.js`, `temu-route-test.js`) to `node:test`:
  - `temu.webhooks.test.js`: tests `decrypts the guide example` (eventData `sQmNTAKR2o4HrmCO3OchFgGyJU5Qta57+JQxxgVyVPU=` with secret `12345678abcdefgh` → `{"orderSn":"XXYYZZ","status":1}`), `accepts guide signature b5143d1a…338fb (lower and upper case)`, `rejects bad signature / other app key / undecryptable data with 401`, `queues orders sync for each of the 5 event codes`, `ignores duplicate push`, `route answers {"result":{}} with 200`.
  - `temu.actions.test.js`: the shipment.v2.confirm payload, out-of-stock cancel, refund/decide/cancel-agree, getOrders enrichment, and the promotions/ads/returns section assertions, unchanged from the session script.
  - `tiktok.webhooks.test.js`: `verify accepts HMAC-SHA256 of appKey+rawBody`, `rejects tampered body`, `resolveKind maps ORDER_STATUS_CHANGE→orders, PRODUCT_STATUS_CHANGE→listings, NEW_MESSAGE→inbox, SELLER_DEAUTHORIZATION→deauth`.
  - `ebay.notifications.test.js`: `handle rejects a request with a bad signature` and `maps an ItemSold/FixedPriceTransaction notification to an orders sync`. Build the SOAP body with the fields `ebayNotifications.handle` reads. Read that file to get them.
- [ ] **Step 3: Run.** `cd backend && npm test`. Expected: all pass, and both snapshot files are written on the first run. Inspect `profiles.json`: 3 keys; temu has 10 sections, including `promotions` and `ads`.
- [ ] **Step 4: Run again.** `npm test`. Expected: all pass, with no snapshot written.
- [ ] **Step 5: Commit.** `git add backend/test backend/package.json && git commit -m "Add backend test suite"`, then push.

### Task 2: Registry, adapter contract and empty skeleton

**Files:**
- Create: `backend/marketplaces/index.js`, `backend/marketplaces/contract.js`, `backend/test/registry.test.js`
- Create (temporary adapters wrapping today's files; each move task replaces them): `backend/marketplaces/{ebay,tiktok_shop,temu}/index.js`
- Modify: `backend/server.js` (call `assertAdapters()` once at boot, before `app.listen`)

**Interfaces:**
- Produces, in `contract.js`:
  - `REQUIRED = ['key', 'label', 'config', 'service', 'profile', 'sections']`
  - `OPTIONAL = ['webhooks', 'hooks', 'capabilities']`
  - `checkAdapter(adapter): string[]` returns the missing required member names. Unknown or optional members are never reported.
- Produces, in `marketplaces/index.js`:
  - `KEYS = ['ebay', 'tiktok_shop', 'temu']`
  - `get(key): Adapter`: lazy `require('./' + key)`; throws `Unknown marketplace <key>`.
  - `all(): Adapter[]`
  - `assertAdapters(): void`: throws `Marketplace <key> is missing: a, b`.
  - `labels(): Record<key, string>`
- Adapter shape (required): `key` string; `label` string; `config` (that shop's block of `config/marketplaces.js`); `service` (the singleton `getService(key)` returns today); `profile` (today's `PROFILES[key]`); `sections` (today's `{ [sectionId]: (token, shop) => Promise<{summary, tables}> }` loader map).

- [ ] **Step 1: Write the failing test.** In `registry.test.js`:
  - `KEYS are ebay, tiktok_shop, temu`
  - `get throws for unknown key`
  - `every adapter passes checkAdapter`
  - `checkAdapter reports missing required, ignores optional`, with assertions `checkAdapter({key:'x'})` deep-equals `['label','config','service','profile','sections']` and `checkAdapter({...full, webhooks: undefined})` deep-equals `[]`.
  - `each adapter loads in a fresh process`: `child_process.execFileSync(process.execPath, ['-e', "const a=require('./marketplaces').get('<key>'); if(typeof a.service.call!=='function' && typeof a.service.getOrders!=='function') process.exit(1)"], { cwd: backend })`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, `Cannot find module './marketplaces'`.
- [ ] **Step 3: Implement** `contract.js` and `index.js` as above. Both start with `// @ts-check`. `contract.js` defines `@typedef {Object} Adapter`, with the required members typed and the optional ones marked `[name]`. `index.js` annotates `get` as `@returns {Adapter}`. Each `marketplaces/<key>/index.js` starts with `// @ts-check` and `/** @type {import('../contract').Adapter} */`. The three temporary adapters re-point to the current locations (`../../services/marketplace/<file>`, `PROFILES[key]`, `LOADERS[key]`). Export `LOADERS` from `sections.js` for this. Add `assertAdapters()` to `server.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Also run `node -e "require('./marketplaces').assertAdapters()"` in `backend/`. Expected: no output, exit code 0.
- [ ] **Step 5: Commit and push.** `"Add marketplace registry and adapter contract"`

### Task 3: Move Temu into `backend/marketplaces/temu/`

**Files (git mv first, then edit, so history follows):**
- `services/marketplace/temu.js` → split:
  - `marketplaces/temu/client.js`: `call`, `sign`, auth (`getAuthUrl`, `exchangeCode`, `refreshToken`), `listingCapabilities`, `endableStatuses`
  - `marketplaces/temu/orders.js`: `getOrders`, `fillOrderDetails`, `resolveCarrierId`, `defaultWarehouseId`, `createShippingFulfillment`, `cancelOrder`, `afterSalesForOrder`, `issueRefund`, `decideReturn`, `decideCancellation`, plus helpers `temuDate`, `temuMoney`, `temuAddress`, `ORDER_STATUS`
  - `marketplaces/temu/listings.js`: `getInventory`, `createListing`, `updateStock`, `reviseListing`, `applyListingAction`, `updatePrice`
- `services/temuNotifications.js` → `marketplaces/temu/webhooks.js`
- Temu block of `config/marketplaces.js` → `marketplaces/temu/config.js`. `config/marketplaces.js` becomes `{ ebay: <inline for now>, tiktok_shop: <inline for now>, temu: require('../marketplaces/temu/config') }`.
- Temu probes and the `PROFILES.temu` object in `services/marketplace/profiles.js` → `marketplaces/temu/profile.js`
- `TEMU` and helpers (`temuTime`, `temuAmount`, `temuGoodsRows`, `TEMU_AFTERSALES_STATUS`, `adVal`, `adMoney`, `temuAdReport`, `AFTERSALES_GROUP`) in `services/marketplace/sections.js` → `marketplaces/temu/sections/{returns,prices,fulfillment,promotions,ads}.js` + `marketplaces/temu/sections/index.js` (the id → loader map)
- Shared section helpers (`col`, `tables`, `words`, `firstList`, `money`, `seconds`) → `services/marketplace/sectionKit.js`, used by all three shops
- `scripts/temu-smoke.js`, `scripts/cleanup-temu-duplicates.js` → `marketplaces/temu/scripts/smoke.js`, `marketplaces/temu/scripts/cleanup-duplicates.js`. In `package.json`: `smoke:temu` → `node marketplaces/temu/scripts/smoke.js`, `cleanup:temu` → `node marketplaces/temu/scripts/cleanup-duplicates.js`.
- `test/temu.*.test.js` → `marketplaces/temu/test/{webhooks,actions}.test.js`
- Modify importers: `services/marketplace/index.js` (`marketplaceServices.temu`), `services/marketplace/profiles.js` (PROFILES built as `{ ...ebay, ...tiktok_shop, temu: registry.get('temu').profile }`), `services/marketplace/sections.js` (`LOADERS.temu` from the registry), `services/syncQueue.js` (`LIVE_UPDATES.temu`), `routes/system/api.js`.

**Interfaces:**
- Consumes: `get('temu')`, `checkAdapter` (Task 2), `stubModules` (Task 1).
- Produces: `marketplaces/temu/index.js` exporting `{ key:'temu', label:'Temu Shop', config, service, profile, sections, webhooks }`. `service` is **one object** (`Object.assign(new TemuClient(), ordersMethods, listingsMethods)`), so `manager.getService('temu')` keeps every method name it has today. `webhooks` = `{ open, process, handle, enable }`.

- [ ] **Step 1: Point the moved tests at the new paths and run** `npm test`. Expected: FAIL (module not found).
- [ ] **Step 2: Do the moves and import updates above.** Then `grep -rn "temuNotifications\|marketplace/temu'\|marketplace/temu\")" backend --exclude-dir=node_modules` → no hits.
- [ ] **Step 3: Run** `npm test`. Expected: PASS, including unchanged profile and route snapshots, and the Temu webhook, actions and sections tests.
- [ ] **Step 4: Run** `node -e "require('./marketplaces').assertAdapters()"`. Expected: no output.
- [ ] **Step 5: Commit and push.** `"Move Temu into marketplaces/temu"`. Ask the user to deploy and run `docker compose exec backend npm run smoke:temu` before Task 4.

### Task 4: Move TikTok Shop into `backend/marketplaces/tiktok_shop/`

**Files:**
- `services/marketplace/tiktok.js` (2,033 lines) → split by API area, using the path each method calls:
  - `client.js`: `call`, signing, auth/token, shop cipher, file upload helpers
  - `orders.js`: `/order`, `/fulfillment`, `/return_refund`, `/logistics`
  - `listings.js`: `/product`, including categories, attributes, brands, size charts, images
  - `promotions.js`: `/promotion`
  - `finance.js`: `/finance`
  - `inbox.js`: `/customer_service`
  - `analytics.js`: `/analytics`, `/affiliate`
  
  A method that touches two areas goes where its *name* says it belongs.
- `services/tiktokNotifications.js` → `marketplaces/tiktok_shop/webhooks.js`
- Config, profile, `TIKTOK` sections (one file per section id in `LOADERS.tiktok_shop`), and `scripts/tiktok-smoke.js` → `marketplaces/tiktok_shop/scripts/smoke.js` (`smoke:tiktok` keeps its name), plus tests, following Task 3's pattern.
- Modify importers: `routes/analytics/analytics.js` (imports `tiktok` directly → `require('../../marketplaces').get('tiktok_shop').service`), plus the files listed in Task 3.

**Interfaces:**
- Produces: `marketplaces/tiktok_shop/index.js` with the same adapter shape. `service` keeps every method name of today's `tiktok.js` export.
- [ ] **Step 1: Move the tests and run.** Expected: FAIL.
- [ ] **Step 2: Do the moves.** Then a grep for `tiktokNotifications|marketplace/tiktok` → no hits.
- [ ] **Step 3: Add the test** `service exposes every method it had before`. Generate the expected list once, before moving, with `Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).concat(Object.keys(svc))`, then compare it with the composed `service`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit and push.** `"Move TikTok Shop into marketplaces/tiktok_shop"`. User runs `npm run smoke:tiktok`.

### Task 5: Move eBay into `backend/marketplaces/ebay/`

**Files:**
- `services/marketplace/ebay.js` + `ebayHttp.js` → `client.js` (REST, auth, `ebayFetch`). `ebayTrading.js` → `trading.js` (XML Trading API, unchanged inside). Order, return, cancellation and fulfillment methods → `orders.js`. Listing, inventory, offer, promotion and category methods → `listings.js`. Message methods → `inbox.js`. Payout methods → `finance.js`.
- `services/ebayNotifications.js` → `webhooks.js`. `services/ebayAccountDeletion.js` → `accountDeletion.js`.
- Config, profile, `EBAY` sections, and scripts: `ebay-smoke.js` → `scripts/smoke.js`, `cleanup-ebay-placeholders.js` → `scripts/cleanup-placeholders.js`, `fix-ebay-products.js` → `scripts/fix-products.js`, `ebay-listing-check.js` → `scripts/listing-check.js`. npm names `smoke:ebay` and `cleanup:ebay` are unchanged.
- Modify importers: `agent/discovery/listingImage.js`, `agent/discovery/usListings.js`, `services/productImport.js`, `routes/system/api.js`, and `services/marketplace/{index,profiles,sections}.js`. After this task, `config/marketplaces.js` is three `require`s only.

**Interfaces:**
- Produces: `marketplaces/ebay/index.js` with the adapter shape, plus `trading` exported on the adapter (`get('ebay').trading`) for the scripts and the discovery agent.
- [ ] **Steps 1–5 as in Task 4:** failing tests first, moves, method-list test, `npm test` passes, then commit and push `"Move eBay into marketplaces/ebay"`. User runs `npm run smoke:ebay`.
- After this task, `services/marketplace/` holds only `index.js`, `profiles.js`, `sections.js` and `sectionKit.js`.

### Task 6: Shared core stops branching on shop names

**Files:**
- Modify: `services/marketplace/index.js`, `services/marketplace/profiles.js`, `services/marketplace/sections.js`, `routes/system/shops.js`, `services/syncQueue.js`, `services/inboxBot.js`, `utils/marketplace.js` (`CANONICAL` built from `KEYS` plus the alias `tiktok → tiktok_shop`)
- Modify: each `marketplaces/<key>/index.js` (add `hooks` and `capabilities`)
- Create: `backend/test/no-shop-branches.test.js`

**Interfaces (optional adapter members added here):**
- `capabilities: { inbox: boolean, refreshToken: boolean, tracksOrdersSyncedAt: boolean, listingFetchLimit: number }`. These replace the `['ebay','tiktok_shop'].includes(...)` checks at manager lines 892, 1226, 1657 and 1685.
- `hooks.fetchOrders(manager, shop, token, service) → { orders, cancellations, returns, complete }`. eBay supplies it from `fetchEbayOrders` + `attachEbayTracking` (manager L183–233, L257–262). Without it, the core uses `service.getOrders`.
- `hooks.fetchListings(manager, shop, token, service)`. eBay supplies it from `fetchEbayListings` (L1145–1221, L1224).
- `hooks.listingKey(externalListingId) → string`. TikTok supplies `productKey`. It replaces the special cases at L643, L1016, L1299, L1409 and L1564.
- `hooks.prepareListing(product, options) → { images, options }` (L104–L108: TikTok image handling, eBay variants).
- `hooks.shippingLineItems(service, token, order, lineItems) → lineItems` (L169: eBay re-reads line items).
- `hooks.orderImages(service, token, item)` (L561, L666: eBay app token / `getItemDetails`).
- `profiles.js` exports `PROFILES` built from `all().map(a => [a.key, a.profile])`. `sections.js` builds `LOADERS` from `all()`. Both keep `ACCESS_TTL_MS`, `probeSections` and `describe` unchanged.
- `syncQueue.KINDS.live.applies/run` and `inbox.applies` use `adapter.webhooks` and `adapter.capabilities.inbox`.
- `shops.js` handlers call `get(marketplace).service.*` and `get(marketplace).webhooks.enable`. Route paths are unchanged (snapshot).
- `utils/marketplace.js` is deleted. Its 8 importers use `require('<rel>/marketplaces').canonical(value)`, which has the same behaviour: `'all'` and falsy give `null`, `tiktok` gives `tiktok_shop`, unknown gives `null`.
- `utils/listingUrl.js` is deleted. Each adapter exports `listingUrl(listing) → string`, with today's per-shop URL logic moved verbatim. Callers use `get(listing.marketplace).listingUrl(listing)`.
- `ebaySku` moves from `utils/sku.js` to `marketplaces/ebay/sku.js`. `newSku` and `isMachineSku` stay in `utils/sku.js`.
- Extra test in `registry.test.js`: `canonical maps all/''/null→null, tiktok→tiktok_shop, ebay→ebay, foo→null`.

- [ ] **Step 1: Write the failing test.** `no-shop-branches.test.js` → `core files have no shop-name literals`: for each of `services/marketplace/index.js`, `services/marketplace/profiles.js`, `services/marketplace/sections.js`, `routes/system/shops.js`, `services/syncQueue.js` and `services/inboxBot.js`, assert the source has no match for `/['"](ebay|tiktok_shop|temu)['"]/`. Lines containing `// shop-literal-ok:` with a reason are allowed; use this for user-facing copy only.
- [ ] **Step 2: Run.** Expected: FAIL, listing the files and lines.
- [ ] **Step 3: Replace each branch** with the capability or hook above. Move the eBay helper methods named above into `marketplaces/ebay/hooks.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, with snapshots unchanged.
- [ ] **Step 5: Commit and push.** `"Shared marketplace core uses adapters instead of shop branches"`. User deploys and does a full sync of each shop from Settings.

### Task 6a: Shared infrastructure into `services/core/`

**Files:**
- Move: `services/{cache,redis,syncQueue,events,notify}.js` → `services/core/`. Update every importer, including lazy `require('./syncQueue')` inside functions: `grep -rn "require(.*\(cache\|redis\|syncQueue\|events\|notify\)')" backend --exclude-dir=node_modules`.
- [ ] **Step 1: Write the failing test.** `test/layout.test.js` → `infrastructure lives in services/core` asserts the 5 files exist under `services/core/` and none at `services/`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Move and fix the imports.** Also point `test/no-shop-branches.test.js` at `services/core/syncQueue.js`.
- [ ] **Step 4: Run** `npm test` (all pass) and `node -e "require('./services/core/syncQueue')"` (no throw).
- [ ] **Step 5: Commit and push.** `"Move shared infrastructure into services/core"`

### Tasks 6b–6f: Domain services (one task and one commit per domain)

Run in this order, each as its own task:

| Task | Domain | Routes thinned | Logic moves to | Loose services joining |
|---|---|---|---|---|
| 6b | catalog | `routes/catalog/products.js`, `routes/catalog/inventory.js` | `services/catalog/{products,inventory}.js` | `productImport.js`, `excelExport.js` |
| 6c | sales | `routes/sales/orders.js`, `routes/sales/customers.js` | `services/sales/{orders,customers}.js` | `customerStats.js` |
| 6d | research | `routes/research/research.js` | `services/research/reports.js` | (also `services/inbox/`: `inboxBot.js`, and `services/system/`: `aiSettings.js`, moved here as one small step; update the `inboxBot` path in `test/no-shop-branches.test.js`) |
| 6e | auth | `routes/auth/auth.js` | `services/auth/{users,subAdmins}.js` | — |
| 6f | analytics | `routes/analytics/analytics.js` | `services/analytics/reports.js` | — |

`routes/system/shops.js` is already thin after Task 6. Whatever DB logic is left in it (shop list, AI-reply toggle, configs) moves to `services/system/shops.js` in 6f.

**Interfaces (every domain task):**
- A service function takes plain inputs `({ user, access, ...params })` and returns plain data. It throws `HttpError(status, message)` from `utils/httpError.js` (created in 6b: `class HttpError extends Error { constructor(status, message) }`). Routes catch it and send `res.status(err.status || 500).json({ error: err.message })`, which is the same error JSON they send today.
- A route handler only parses `req`, calls one service function and sends the result.

**Steps per domain task:**
- [ ] **Step 1: Write the failing tests** in `test/<domain>.service.test.js`, with models replaced through `stubModules` by in-memory stand-ins. The main flows per domain:
  - catalog: `list filters by marketplace and search`, `create rejects duplicate SKU`, `update pushes stock to linked listings` (assert that `manager.pushStock` was called once per linked listing), `sub-admin sees only own drafts`
  - sales: `cancel calls adapter cancel and marks order cancelled`, `ship stores tracking and calls pushShipping`, `refund forwards amount and orderTotal`
  - research: `owner-only report access`, `relist uses existing listing`
  - auth: `login rejects wrong password`, `sub-admin without route permission gets 403`, `password hash never returned`
  - analytics: `totals sum orders per marketplace in range`
- [ ] **Step 2: Run.** Expected: FAIL (service module missing).
- [ ] **Step 3: Move the logic** from the route handlers into the service, unchanged. Move the loose services into the domain folder and fix the imports.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, with the routes snapshot unchanged and route files under ~150 lines.
- [ ] **Step 5: Commit and push.** `"Move <domain> logic into services/<domain>"`

### Task 7: Frontend registry and shop section files

**Files:**
- Create: `frontend/src/marketplaces/index.js`, `frontend/src/marketplaces/{ebay,tiktok_shop,temu}/index.js`, `frontend/src/marketplaces/<key>/sections/<sectionId>.jsx` (one file per section that has custom columns or actions today: ebay `returns`, `offers`, `promotions`, `fulfillment`; tiktok_shop `returns`, `promotions`, `fulfillment`; temu `returns`), `frontend/src/marketplaces/<key>/settings.jsx`, `frontend/test/structure.test.mjs`
- Modify: `frontend/package.json` (add `"test": "node --test"`), `frontend/src/lib/marketplaces.js` (moved into the registry, then deleted, with importers updated), `frontend/src/pages/shop/ShopSectionPage.jsx`, `frontend/src/pages/settings/SettingsPage.jsx`, `frontend/src/hooks/useShopProfiles.js`, `frontend/src/pages/sub-admins/{SubAdminManagementPage,SubAdminFormPage}.jsx`, `frontend/src/pages/customers/{CustomerDrawer,CustomersPage}.jsx`, `frontend/src/pages/orders/OrderDrawer.jsx`, `frontend/src/lib/access.js` (`MARKETPLACE_SUBSECTIONS[key]` → `marketplaces/<key>/index.js` `subsections`)

**Interfaces:**
- Registry: `MARKETPLACES` (the same array `lib/marketplaces.js` exports today: id, label, colors), `marketplaceLabel(id)`, `marketplaceBadgeColor(id)`, `EVIDENCE_LABELS`, `getShop(key) → { key, label, subsections, sections, settings }`.
- Section file contract: `export default { tableActions: { [tableId]: (row, { onAction, marketplace }) => ReactNode }, actions: { [actionType]: async (row, ctx) => void } }`. `ctx` = `{ api, token, marketplace, load, setLoading, setError, openOffer }`. `ShopSectionPage` keeps loading, tables and pagination, and appends an Action column only when the shop's section file has `tableActions[table.id]`.
- `settings.jsx` exports `liveUpdatesText(shop) → string` (today's Temu/eBay/TikTok copy in SettingsPage L211–217).

- [ ] **Step 1: Write the failing test.** `structure.test.mjs` → `no hardcoded shop lists outside marketplaces/`: walk `src/` excluding `src/marketplaces/` and assert no file matches `/\[\s*'ebay',\s*'tiktok_shop'/` or `/marketplace === '(ebay|tiktok_shop|temu)'/`. The same `// shop-literal-ok:` escape applies.
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: FAIL, listing 12 files (counts from research: ShopSectionPage 14, useShopProfiles 9, DirectListModal 6, ListModal 5, SettingsPage 4, …). ListModal, DirectListModal, ProductModal and VariantEditor are allowed to fail until Task 8. Mark those 4 with `test.todo` entries named after them.
- [ ] **Step 3: Implement** the registry, the section files and the page changes above.
- [ ] **Step 4: Run** `npm test && npm run build && npx oxlint src`. Expected: tests pass (4 todo), build OK, no new lint warnings.
- [ ] **Step 5: Manual check.** Run `npm run dev` and open `/shop/returns?shop=<id>` for each shop, plus Settings and Sub-admins. Action buttons must match today's: Temu has Approve only, eBay and TikTok have Approve and Decline/Reject.
- [ ] **Step 6: Commit and push.** `"Frontend marketplace registry and per-shop section files"`

### Task 8: Listing forms split by shop

**Files:**
- Move: `frontend/src/lib/ebayListing.js` → `src/marketplaces/ebay/listing/rules.js`. `lib/tiktokListing.js` → `src/marketplaces/tiktok_shop/listing/rules.js`. `components/listing/{EbayBestOfferField,EbayIdentifierField}.jsx` → `src/marketplaces/ebay/listing/`. `components/listing/{IdentifierCodeField,CertificationFields,SizeChartField,BrandPicker}.jsx` → `src/marketplaces/tiktok_shop/listing/`. `AttributeField.jsx` and `VariantEditor.jsx` stay shared in `components/listing/`.
- Create: `src/marketplaces/<key>/listing/Fields.jsx` and `src/marketplaces/<key>/listing/validate.js` for each shop. Temu's are minimal: stock only, matching `listingCapabilities.canList: false` today.
- Modify: `src/pages/products/ListModal.jsx`, `src/pages/products/DirectListModal.jsx`, `src/pages/products/ProductModal.jsx`, `src/components/listing/VariantEditor.jsx`

**Interfaces:**
- `Fields` props: `{ form, setForm, shop, categoryRules, errors, mode: 'list' | 'direct' }`. It renders only the shop-specific inputs; the modal keeps title, price, images, variants and the submit flow.
- `validate(form, { categoryRules, mode }) → { [field]: message }`: today's `validateVariantsForEbay` / `validateVariantsForTikTok` / `validateBestOffer` / identifier checks, returning the same messages.
- The registry exposes `getShop(key).listing = { Fields, validate }`.
- [ ] **Step 1: Write the failing test.** `src/marketplaces/<key>/listing/validate.test.mjs` (plain JS, runs under `node --test`). Freeze today's messages, for example: `ebay: best offer below minimum gives the same message as validateBestOffer`, `tiktok_shop: variant without SKU gives the same message as validateVariantsForTikTok`. Call the old functions once to capture the expected strings before deleting them.
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the moves and the `Fields`/`validate` split. Replace the shop branches in the 4 modal/editor files with `getShop(key).listing`. Remove their `test.todo` from Task 7.
- [ ] **Step 4: Run** `npm test && npm run build && npx oxlint src`. Expected: PASS, with no todo left.
- [ ] **Step 5: Manual check** in `npm run dev`, against the production API or a local backend with real shops:
  - Open List and Direct list for an eBay product and a TikTok product.
  - Every field that was there before is still there.
  - Category rules, size charts, brands and identifiers still load.
  - Submitting with a missing required field shows the same error.
  - Save one TikTok product as a draft and check it shows up in TikTok Seller Center.
- [ ] **Step 6: Commit and push.** `"Split listing forms into per-shop Fields and validate"`

### Task 8a: Split the big non-shop pages

**Files:**
- `src/pages/sub-admins/SubAdminManagementPage.jsx` (1,035 lines) → keeps the page layout. New files: `src/pages/sub-admins/components/{SubAdminTable,PermissionMatrix,ShopAccessEditor,InviteForm}.jsx` and `src/pages/sub-admins/hooks/useSubAdmins.js` (loading, saving, deleting).
- `src/pages/sub-admins/SubAdminFormPage.jsx` (718) → reuses `PermissionMatrix` and `ShopAccessEditor`, plus `hooks/useSubAdminForm.js`.
- `src/pages/discovery/ProductDiscoveryPage.jsx` (511) → `src/pages/discovery/components/{RunForm,ReportList,CandidateCard}.jsx` and `src/pages/discovery/hooks/useDiscovery.js`.

Component names are suggestions. Split along the page's existing visual blocks. Each extracted file stays under ~300 lines.
- [ ] **Step 1: Write the failing test.** Add `page files stay under 500 lines` to `frontend/test/structure.test.mjs`. It covers every `src/pages/**/*.jsx` except `ListModal`/`DirectListModal`, which Task 8 already split.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, naming the 3 pages.
- [ ] **Step 3: Split.** No behaviour change: same requests, same state, same markup.
- [ ] **Step 4: Run** `npm test && npm run build && npx oxlint src` (pass). Manually check: create, edit and delete a sub-admin; change their permissions; run a discovery search.
- [ ] **Step 5: Commit and push.** `"Split sub-admin and discovery pages into components and hooks"`

### Task 9: Docs and paths

**Files:**
- Create: `backend/marketplaces/README.md` (folder shape, adapter contract with required/optional members, "add a section" and "add a shop" steps), `frontend/src/marketplaces/README.md` (registry, section-file contract, listing `Fields`/`validate`)
- Create: `backend/services/README.md` (core vs marketplace vs domain folders; "routes are thin" rule; the `HttpError` convention)
- Modify: `frontend/src/pages/README.md`, `.agents/skills/{ebay,temu,tiktok}-shop-api/SKILL.md` (paths only; `.cursor/skills` follows through the symlink), `README.md` (the folder map stops saying "target"), and this plan (tick boxes)
- [ ] **Step 1: Check for stale paths.** `grep -rn "services/marketplace/\(ebay\|tiktok\|temu\)\|ebayNotifications\|tiktokNotifications\|temuNotifications\|lib/ebayListing\|lib/tiktokListing" --exclude-dir=node_modules --exclude-dir=graphify-out .` → no hits.
- [ ] **Step 2: Run** `cd backend && npm test`, then `cd ../frontend && npm test && npm run build`. Expected: all pass.
- [ ] **Step 3: Rebuild the graph.** Run `/graphify --update`, then check in `GRAPH_REPORT.md` that `marketplaces/<key>` files group into one community per shop.
- [ ] **Step 4: Commit and push.** `"Document shop modules and update paths"`
