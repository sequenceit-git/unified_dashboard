# eBay API Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eBay sellers see listing traffic, seller level, earnings, inquiries/cases/disputes, feedback, Best Offers and promotion results in the eBay pages, from eBay APIs the dashboard doesn't call yet.

**Architecture:** Each feature is a table (or tiles) in an eBay section loader (`backend/marketplaces/ebay/sections/<id>.js`, `{ summary, tables }` via `sectionKit`) with a `tab`; row actions are POST routes in the eBay app. On the frontend, one eBay `SectionView` renders any eBay section as tabs of tables with row actions; eBay section pages use it. Four new OAuth scopes come from config with an env override; shops that connected before see which features a reconnect turns on.

**Tech Stack:** Node 24, Express 5, node:test with `test/helpers/stub.js`; React + Vite, `components/ui` (Tabs, Card, DataTable, Modal, Button).

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-rollout-design.md` (wave 1, page and layout rules, permissions). Endpoint details: `docs/api-coverage/catalog/ebay.json` and eBay's contracts linked in its `sources`.

## Global Constraints

- Only files under `backend/marketplaces/ebay/`, `frontend/src/marketplaces/ebay/`, tests, and `docs/api-coverage/` change, plus the one generic line in `services/marketplace/profiles.js` (Task 1). No other shop's code changes; `sectionKit` and `components/ui` are used as they are.
- New scopes, exactly: `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`, `.../sell.finances.earnings.read`, `.../sell.payment.dispute`, `.../commerce.feedback`. Env `EBAY_EXTRA_SCOPES` (space- or comma-separated) replaces this list; `EBAY_EXTRA_SCOPES=""` asks for none.
- A table whose API answers 401/403 or an "insufficient scope" error shows: `Reconnect eBay in Settings to allow <feature>.` (`<feature>` = the table title, lower-case).
- Marketplace id for analytics/marketing filters: `'EBAY_US'` (the id the eBay code already sends everywhere). Date ranges: the last 30 full days, ending yesterday (UTC).
- Row actions: `row.actions = [{ id, label, confirm?, input? }]`; the page posts `POST /api/ebay/sections/<sectionId>/<actionId>` with `{ id: row.id, value? }`, then reloads the section with `refresh=1`. Every action route uses `sectionGuard(<sectionId>)`.
- Section cache: unchanged (10 min, cleared by orders sync, `?refresh=1`).
- Push directly to `main` after each task. Never run anything against the production database or `.env`.

## Review Focus

1. A shop connected before this change (no `grantedScopes`) opens Analytics → the traffic table says to reconnect, and the Sales tab still works → Task 3 test `a missing scope shows a reconnect message, not the API error`.
2. A scope the eBay keyset doesn't allow would break consent for everyone → `EBAY_EXTRA_SCOPES=""` removes all four from the consent link → Task 1 test `extra scopes can be switched off without a deploy`.
3. A listing in the traffic report that the dashboard doesn't know still shows (item id, no title) → Task 3 test `traffic rows keep unknown listings`.
4. A sub-admin without Returns & cases can't accept a dispute through the API → Task 5 test `dispute accept needs the returns-cases section`.
5. Accepting or refunding twice (double click) doesn't send two requests → Task 2 test `an action button is disabled while its request runs`.

---

### Task 1: Scopes and reconnect notice

**Files:** modify `backend/marketplaces/ebay/config.js`, `backend/marketplaces/ebay/client.js` (`exchangeCode` result), `backend/marketplaces/ebay/index.js` (adapter hook `missingScopes(shop)`), `backend/services/marketplace/profiles.js` (one generic line next to `grantedScopes`: `missingScopes: adapter.missingScopes?.(shop) || []`); create `frontend/src/marketplaces/ebay/ReconnectNotice.jsx`; test `backend/marketplaces/ebay/test/scopes.test.js`.

**Interfaces:** Produces `config.scopes` (base six + extra), `config.extraScopes: string[]`, `exchangeCode()` result gains `grantedScopes: config.scopes` (eBay's token reply doesn't list scopes; the consent covered exactly these). Profile gains `missingScopes: { scope, feature }[]` = extra scopes not in `shop.grantedScopes`; a shop with no `grantedScopes` is treated as holding the base six. `FEATURES = { 'sell.analytics.readonly': 'Listing traffic and seller level', 'sell.finances.earnings.read': 'Order earnings', 'sell.payment.dispute': 'Payment disputes', 'commerce.feedback': 'Feedback' }`.

- [ ] **Step 1: Failing tests** — `the consent link asks for the four new scopes` (auth URL's `scope` param contains each); `extra scopes can be switched off without a deploy` (with `EBAY_EXTRA_SCOPES=""`, freshRequire config → `scopes.length === 6`); `a new connection records the scopes it asked for` (stub fetch token reply → `exchangeCode` result `grantedScopes` deep-equals `config.scopes`); `an older shop is told what a reconnect turns on` (profile for shop `{ grantedScopes: [] }` → `missingScopes.map(m => m.feature)` equals the four FEATURES values in order).
- [ ] **Step 2:** `cd backend && node --test marketplaces/ebay/test/scopes.test.js` → FAIL.
- [ ] **Step 3:** Implement. `ReconnectNotice({ profile })` renders nothing when `missingScopes` is empty, else one line: "Reconnect eBay in Settings to turn on: <features joined by ', '>." with a link to `/settings`; render it at the top of the eBay Analytics, Payouts, Returns & cases and Buyers pages.
- [ ] **Step 4:** run → PASS; `npm test` (backend) and `cd ../frontend && npm test && npm run build` → green.
- [ ] **Step 5:** Commit `"eBay: ask for analytics, earnings, dispute and feedback scopes; tell older shops to reconnect"`.

### Task 2: eBay SectionView — tabs of tables with row actions

**Files:** create `frontend/src/marketplaces/ebay/sectionTabs.js`, `frontend/src/marketplaces/ebay/SectionView.jsx`, `frontend/src/marketplaces/ebay/ActionButton.jsx`; modify the eBay `payouts`, `returns-cases`, `offers`, `promotions` pages to render `<SectionView sectionId="…" />` (delete their copied `components/SectionTable.jsx` and load/permission code; keep each page's `sectionFormat.jsx` cell formatting, moved to `frontend/src/marketplaces/ebay/sectionFormat.jsx` once); test `frontend/test/ebay-sections.test.mjs`.

**Interfaces:** Produces `sectionTabs(data) → [{ id, label, summary: Tile[], tables: Table[] }]` (tab order = first appearance in `data.tables`; tables without `tab` go to tab `'main'` labelled by the section; tiles with no `tab` go to every tab; one tab total → no tab bar) and `<SectionView sectionId extraTabs? />` (`extraTabs: [{ id, label, render: () => node }]` are placed first — used by Analytics and Buyers to keep their current content as the first tab). Consumes the row-action contract from Global Constraints.

- [ ] **Step 1: Failing tests** — `tables group into tabs in loader order` (`[{id:'a',tab:'Inquiries'},{id:'b'},{id:'c',tab:'Cases'},{id:'d',tab:'Inquiries'}]` → tab labels `['Inquiries','<section>','Cases']`, Inquiries holds a and d); `tiles without a tab show on every tab`; `one tab means no tab bar` (`sectionTabs({tables:[{id:'x'}]}).length === 1`); `an action button is disabled while its request runs` (pure helper `actionState` from `ActionButton.jsx` exported as a plain function: `start(id)` then `isBusy(id) === true` and a second `start(id)` returns false until `done(id)`).
- [ ] **Step 2:** `cd frontend && node --test test/ebay-sections.test.mjs` → FAIL.
- [ ] **Step 3:** Implement. Actions with `input` open `components/ui/Modal` with one number field; `confirm` shows a confirm step in the same modal (no `window.confirm`). After an action: success toast text = the route's `{ message }`, then reload with refresh.
- [ ] **Step 4:** run → PASS; `npm test && npm run build` → green; the four pages look as before (one tab each until later tasks add tabs).
- [ ] **Step 5:** Commit `"eBay pages: one SectionView with tabs and row actions"`.

### Task 3: Analytics — listing traffic and seller level

**Files:** create `backend/marketplaces/ebay/sections/analytics.js`; modify `backend/marketplaces/ebay/sections/index.js` (`analytics`), `backend/marketplaces/ebay/sections/helpers.js` (`scopeAware(load, feature)`); modify `frontend/src/marketplaces/ebay/sections/analytics/AnalyticsPage.jsx` (SectionView with the current charts as `extraTabs` "Sales"); test `backend/marketplaces/ebay/test/sections-analytics.test.js`.

**Interfaces:** Produces `scopeAware(load, feature) → load'` (re-throws other errors; maps 401/403/`insufficient_scope` to the Global Constraints message), reused by Tasks 4–6. Loader `analytics(token, shop) → { summary, tables }` with tables:
- `traffic` (tab "Listing traffic"): `GET /sell/analytics/v1/traffic_report?dimension=LISTING&metric=LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE,TRANSACTION&filter=marketplace_ids:{<id>},date_range:[<YYYYMMDD>..<YYYYMMDD>]`; columns listing, title, impressions, views, click-through %, conversion %, sold; titles via `sectionKit.listingTitles('ebay', ids)`; sorted by views desc. Metric values are read by the order of `header.metrics`, not by position assumptions.
- `standards` (tab "Seller level"): `GET /sell/analytics/v1/seller_standards_profile`; one row per profile: program, cycle, level, defect rate, late shipment rate, cases closed without resolution.
- `service` (tab "Seller level"): `GET /sell/analytics/v1/customer_service_metric/{ITEM_NOT_AS_DESCRIBED|ITEM_NOT_RECEIVED}/CURRENT?evaluation_marketplace_id=<id>`; rows: metric, rating, your rate, peer rate.
- Summary tiles (tab "Listing traffic"): total impressions, total views, average click-through.

- [ ] **Step 1: Failing tests** (stub `'./helpers'` `ebayGet` returning fixtures copied from the contract's example responses) — `traffic report asks for the last 30 days per listing` (URL equals the template above for a fixed clock `2026-11-24` → `date_range:[20261025..20261123]`); `traffic rows map metrics by the header order` (fixture with header order shuffled → right columns); `traffic rows keep unknown listings` (listing not in `listingTitles` → row with item id, `title: ''`); `seller level shows current and projected cycles`; `a missing scope shows a reconnect message, not the API error` (ebayGet rejects `{ status: 403 }` → `tables[0].error === 'Reconnect eBay in Settings to allow listing traffic.'`, other tables still load).
- [ ] **Step 2:** `node --test marketplaces/ebay/test/sections-analytics.test.js` → FAIL.
- [ ] **Step 3:** Implement (clock injectable: `analytics(token, shop, { now = new Date() } = {})`).
- [ ] **Step 4:** run → PASS; backend `npm test`; frontend `npm test && npm run build`.
- [ ] **Step 5:** Commit `"eBay analytics: listing traffic and seller level"`.

### Task 4: Payouts — earnings per order and funds

**Files:** modify `backend/marketplaces/ebay/sections/payouts.js`; test `backend/marketplaces/ebay/test/sections-payouts.test.js`.

**Interfaces:** Adds to the `payouts` loader (host `ebayApiz()` as today): tiles (tab "Funds") from `GET /sell/finances/v1/seller_funds_summary` — Available, Processing, On hold, Total; table `earnings` (tab "Order earnings", via `scopeAware(…, 'order earnings')`) from `GET /sell/finances/v1/order_earnings?limit=50` — order, date, gross, eBay fees, ad fees, shipping labels, refunds, net; tiles (tab "Order earnings") from `GET /sell/finances/v1/order_earnings_summary` — gross, fees, net; table `billing` (tab "eBay bill") from `GET /sell/finances/v1/billing_activity?limit=50` — date, type, details, amount. Existing payouts/transactions tables get tab "Payouts".

- [ ] **Step 1: Failing tests** — `funds tiles show available, processing and on hold`; `earnings rows show net after fees and refunds` (fixture from the contract; net is eBay's own net field, never recomputed); `earnings without the scope ask for a reconnect while payouts still load`.
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"eBay payouts: funds, order earnings and eBay bill"`.

### Task 5: Returns & cases — inquiries, cases, payment disputes and one-click actions

**Files:** modify `backend/marketplaces/ebay/sections/returns-cases.js`, `backend/marketplaces/ebay/app/routes/sections.js`, `backend/marketplaces/ebay/app/services/sections.js`; test `backend/marketplaces/ebay/test/sections-returns-cases.test.js`.

**Interfaces:** Tables (Post-Order calls use the same auth/headers as the existing return search): `returns` (tab "Returns", existing, rows gain actions `mark-received` "Mark received" when state is awaiting receipt, `refund` "Refund" with `confirm`), `inquiries` (tab "Inquiries", `GET /post-order/v2/inquiry/search?inquiry_status=OPEN`; actions `inquiry-refund` "Refund" with confirm, `inquiry-tracking` "Add tracking" with `input` = tracking number + carrier select limited to the carriers eBay lists), `cases` (tab "Cases", `GET /post-order/v2/casemanagement/search?case_status_filter=OPEN`, read only), `disputes` (tab "Payment disputes", `GET /sell/fulfillment/v1/payment_dispute_summary?limit=50` on `ebayApiz()`, `scopeAware(…, 'payment disputes')`; action `dispute-accept` "Accept" with confirm on open disputes). Service functions `markReturnReceived`, `refundReturn`, `refundInquiry`, `addInquiryTracking`, `acceptDispute` each take `ctx` with `body.id` (and `body.value`), call the endpoint, return `{ message }`. Routes: `POST /returns-cases/<actionId>`.

- [ ] **Step 1: Failing tests** — `open inquiries and cases are listed`; `dispute rows offer Accept only while open`; `each action calls its endpoint` (table-driven: action id → method + path, e.g. `dispute-accept` → `POST /sell/fulfillment/v1/payment_dispute/D1/accept`); `dispute accept needs the returns-cases section` (route test with a sub-admin without it → 403, endpoint not called).
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"eBay returns and cases: inquiries, cases, payment disputes and quick actions"`.

### Task 6: Buyers — feedback

**Files:** create `backend/marketplaces/ebay/sections/buyers.js`; modify `sections/index.js`, `app/routes/sections.js`, `app/services/sections.js`, `frontend/src/marketplaces/ebay/sections/buyers/BuyersPage.jsx` (SectionView with the current buyer list as `extraTabs` "Buyers"); test `backend/marketplaces/ebay/test/sections-buyers.test.js`.

**Interfaces:** Loader `buyers(token, shop)` (all via `scopeAware(…, 'feedback')`): tiles (tab "Feedback") from `GET /commerce/feedback/v1/feedback_rating_summary` (positive %, positive / neutral / negative counts for 12 months, as the contract's query requires for the seller's own `user_id` = `shop.accountUsername`); table `received` from `GET /commerce/feedback/v1/feedback?user_id=<username>&feedback_type=FEEDBACK_RECEIVED&limit=50` — date, buyer, rating, comment, item, reply; action `reply` "Reply" (`input`: text, max 80 characters per eBay) only when no reply exists → `POST /commerce/feedback/v1/respond_to_feedback`. Service `replyToFeedback(ctx)`.

- [ ] **Step 1: Failing tests** — `received feedback is listed newest first`; `reply is offered only where none exists`; `a reply over 80 characters is refused before calling eBay` (400, endpoint not called).
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"eBay buyers: feedback and replies"`.

### Task 7: Offers — Best Offers

**Files:** modify `backend/marketplaces/ebay/sections/offers.js`, `backend/marketplaces/ebay/trading.js` (add `getBestOffers(token)`, `respondToBestOffer(token, { itemId, offerId, action, counterPrice? })`), routes/services; test `backend/marketplaces/ebay/test/sections-offers.test.js`.

**Interfaces:** Table `bestOffers` (tab "Best Offers", first tab) from Trading `GetBestOffers` (`BestOfferStatus=Active`): item, title, buyer, offer price, quantity, expires; actions `offer-accept`, `offer-decline` (confirm), `offer-counter` (`input` = price) → `RespondToBestOffer` with `Action` `Accept` / `Decline` / `Counter`. Existing "interested buyers" table gets tab "Send offers".

- [ ] **Step 1: Failing tests** — `active Best Offers are listed with their expiry`; `counter sends the price` (Trading request body contains `<Action>Counter</Action>` and `<CounterOfferPrice currencyID="USD">12.50</CounterOfferPrice>` for value `12.5`); `a counter without a positive price is refused`.
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"eBay offers: Best Offers with accept, decline and counter"`.

### Task 8: Promotions — results

**Files:** modify `backend/marketplaces/ebay/sections/promotions.js`; test `backend/marketplaces/ebay/test/sections-promotions.test.js`.

**Interfaces:** Tiles (tab "Results") from `GET /sell/marketing/v1/promotion_summary_report?marketplace_id=<id>`; table `results` (tab "Results") from `GET /sell/marketing/v1/promotion_report?marketplace_id=<id>&limit=50` — promotion, status, sales, items sold, buyers, discount given. Existing tables get tab "Promotions" (first).

- [ ] **Step 1: Failing tests** — `promotion results show sales and discount per promotion`; `an empty report shows an empty table, not an error`.
- [ ] **Steps 2–4:** run → FAIL → implement → PASS + suites.
- [ ] **Step 5:** Commit `"eBay promotions: results report"`.

### Task 9: Coverage check and docs

**Files:** modify `backend/test/api-coverage.test.js`, regenerate `docs/api-coverage/` (`npm run api-coverage`), update `backend/marketplaces/README.md` (eBay section: tabs, actions, scopes, reconnect).

- [ ] **Step 1: Failing test** — `eBay wave 1 endpoints are covered`: for each id in this list, `shopCoverage('ebay')` row status starts with `covered`: `GET /sell/analytics/v1/traffic_report`, `GET /sell/analytics/v1/seller_standards_profile`, `GET /sell/analytics/v1/customer_service_metric/{customer_service_metric_type}/{evaluation_type}`, `GET /sell/finances/v1/seller_funds_summary`, `GET /sell/finances/v1/order_earnings`, `GET /sell/finances/v1/order_earnings_summary`, `GET /sell/finances/v1/billing_activity`, `GET /post-order/v2/inquiry/search`, `POST /post-order/v2/inquiry/{inquiryId}/issue_refund`, `POST /post-order/v2/inquiry/{inquiryId}/provide_shipment_info`, `GET /post-order/v2/casemanagement/search`, `POST /post-order/v2/return/{returnId}/mark_as_received`, `POST /post-order/v2/return/{returnId}/issue_refund`, `GET /sell/fulfillment/v1/payment_dispute_summary`, `POST /sell/fulfillment/v1/payment_dispute/{payment_dispute_id}/accept`, `GET /commerce/feedback/v1/feedback`, `GET /commerce/feedback/v1/feedback_rating_summary`, `POST /commerce/feedback/v1/respond_to_feedback`, `Trading:GetBestOffers`, `Trading:RespondToBestOffer`, `GET /sell/marketing/v1/promotion_report`, `GET /sell/marketing/v1/promotion_summary_report`.
- [ ] **Step 2:** run → FAIL only if an id isn't called (fix the call site, not the list).
- [ ] **Step 3:** `npm run api-coverage`; README test passes.
- [ ] **Step 4:** full backend + frontend suites green.
- [ ] **Step 5:** Commit `"eBay wave 1: coverage and docs"`. Deploy note for the user: set nothing (defaults ask the 4 scopes) after confirming in the eBay developer portal that the production keyset lists them; if consent fails, set `EBAY_EXTRA_SCOPES=""` and restart; each eBay shop then clicks Reconnect once.
