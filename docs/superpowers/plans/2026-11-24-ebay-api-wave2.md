# eBay API Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the eBay integration's high-value gaps: a Promoted Listings section (campaigns, ads, ad rates, reports, eBay's ad-rate advice), answering payment disputes, returns, inquiries and cases with messages, evidence files, escalations and appeals, the remaining small gaps in Buyers, Analytics, Payouts and Promotions, and a "who pays shipping" choice (buyer pays / free shipping) on new and already-listed eBay products.

**Architecture:** eBay gets its own generic section drill-down/action routes (`details` / `actions` exported by a section file, own-name lookup), re-implemented in eBay's folder — not imported from Temu or TikTok. Promoted Listings is a new eBay section (`advertising`) with its own loader, page and actions. Post-order and dispute actions extend the existing `sections/returnsActions.js` map. Evidence files travel from the browser as data URLs inside the JSON body and are sent on to eBay as multipart or base64, never stored.

**Tech Stack:** Node 24, Express 5, node:test + `test/helpers/stub.js`; React + Vite; oxlint.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-rollout-design.md` (wave 2: "eBay Promoted Listings … ; eBay dispute contest / case appeal / return escalation with evidence files"). eBay contracts: `sell_marketing_v1_oas3.json`, `sell_fulfillment_v1_oas3.json`, `sell_recommendation_v1_oas3.json`, `commerce_feedback_v1_beta_oas3.json`, `sell_analytics_v1_oas3.json`, `sell_finances_v1_oas3.json` (copies in the session scratchpad `ebay-oas/`; otherwise developer.ebay.com). Post-Order v2 has no OAS: use developer.ebay.com/devzone/post-order.

## Global Constraints

- Shops are independent: nothing under `marketplaces/ebay/` (backend or frontend) imports from `temu/` or `tiktok_shop/`. Only `components/ui/*`, `lib/*`, `sectionKit` and core services are shared. `frontend/test/ebay-sections.test.mjs` gets an independence guard.
- Every eBay path is written in full at its call site (`/sell/marketing/v1/ad_campaign/${enc(id)}/pause`), never built from a base variable — the coverage extractor finds endpoints by path. `npm run api-coverage` after each task.
- Marketplace is `EBAY_US` everywhere, as in the existing loaders.
- Scopes: no new scope. Marketing uses `sell.marketing`, disputes `sell.payment.dispute`, feedback `commerce.feedback`, Post-Order the existing token (`iaf`). `sell.finances.earnings.read` stays out (eBay refuses it for this app).
- Generic routes look up action/detail names with `Object.hasOwn` only (a name like `constructor` must 404, never run).
- A failed action keeps its dialog open with what was typed and shows the error inside it. Tables isolate errors (`sectionKit.tables`). Lists that eBay pages are read across all pages (cap 20 pages, noted in the table when hit).
- Money from eBay is `{ value: string, currency }` → `money()` from sectionKit; ad rates are percentages as eBay sends them (`"5.0"` = 5 %).
- Uploaded evidence is never written to disk, DB, cache or logs.
- Commands chain with `&&`. Commit per task to `main` and push.

## Review Focus

1. Adding more than 500 listings to a campaign → sent in batches of 500; each listing eBay refuses (already in another campaign, ended, not eligible) is listed with eBay's reason; the rest are added. (Task 3 test `adding 1,200 listings goes in three batches and reports refusals`.)
2. A report task still `PENDING`/`IN_PROGRESS` has no View button; `FAILED` shows eBay's reason; a finished report bigger than 500 rows shows the first 500 and says so. (Task 5 tests.)
3. An evidence file that isn't JPEG/PNG (disputes) or is over 5 MB is refused before eBay is called, with the dialog still open. (Task 6 test `a PDF or a 6 MB file is refused before eBay is called`.)
4. A dispute already contested, or whose `availableChoices` has no `CONTEST`, offers no Add evidence / Contest buttons. (Task 6 test.)
5. A sub-admin without the section gets 403 on every new route; `GET /api/ebay/sections/advertising/constructor` is 404 and never reaches eBay. (Task 1 tests.)
6. A listing that uses an eBay shipping business policy (`SellerProfiles.SellerShippingProfile`) is not revised with inline shipping: the edit is refused before anything is sent to eBay, telling the seller to change that policy in Seller Hub (the form keeps what they typed). (Task 11 test `a listing on a shipping policy is refused with the policy's name`.)

---

### Task 1: eBay drill-downs, generic actions, multi-select and file fields

**Files:**
- Modify: `backend/marketplaces/ebay/app/services/sections.js` (add `sectionDetail(ctx)`, `sectionAction(ctx)`)
- Modify: `backend/marketplaces/ebay/app/routes/sections.js` (generic `GET` and `POST /:sectionId/:actionId`, registered after every named route)
- Modify: `frontend/src/marketplaces/ebay/SectionView.jsx`, `ActionButton.jsx`, `SectionTable.jsx`
- Test: `backend/marketplaces/ebay/test/section-generic.test.js`, `frontend/test/ebay-sections.test.mjs`

**Interfaces:**
- Produces (backend): a section file may export `details[name](token, shop, id) → { title, summary?, tables }` and `actions[name](token, shop, id, value) → { message, refused? }`. Served by `GET /api/ebay/sections/:sectionId/:actionId?id=` and `POST /api/ebay/sections/:sectionId/:actionId {id, value}`, behind `sectionGuard(sectionId)` and the same `canUseSection` check as `caseAction`; `cache.del(shop:<id>:section:<sectionId>)` after an action (also when it throws, in `finally`). Existing named routes (`/returns-cases/:actionId`, `/offers/:actionId`, `/promotions/...`) keep priority.
- Produces (frontend): row/table action `{ id, label, confirm?, detail?, input? }`; `input.fields[]` items `{ name, label, type?: 'text'|'number'|'date'|'textarea'|'file', options?: [{value,label}], multiple?: boolean, optional?: boolean, accept?: string }`. A `file` field's value is `{ name, type, size, dataUrl }`. A `multiple` options field's value is `string[]` (checkbox list with "Select all"). `detail: true` opens a read-only modal from `GET …/<action>?id=`.

- [ ] **Step 1: Write the failing backend tests** — `section-generic.test.js`: `a section detail runs the section's own detail` (stub a section file with `details.thing`, GET returns its result); `names from Object.prototype are 404 and never call eBay` (`constructor`, `toString`, `__proto__` → 404, token getter never called); `an action clears the section cache even when it fails`; `a sub-admin without the section gets 403`.
- [ ] **Step 2: Run** `cd backend && node --test marketplaces/ebay/test/section-generic.test.js` — Expected: FAIL (no route/service).
- [ ] **Step 3: Implement** `sectionDetail` / `sectionAction` and the two routes; section files come from `marketplaces/ebay/sections/index.js`.
- [ ] **Step 4: Write the failing frontend tests** in `ebay-sections.test.mjs`: `a multiple field returns the chosen values as an array`; `a file field gives name, type, size and a data URL`; `a failed action keeps the dialog open with its values`; `no file under marketplaces/ebay imports from temu or tiktok_shop` (walk the folder, grep imports).
- [ ] **Step 5: Implement** the field types in `ActionButton.jsx` (file read with `FileReader.readAsDataURL`), table-level actions in `SectionTable.jsx` header, detail modal in `SectionView.jsx` (`onDetail`), mirroring eBay's existing look (blue, `components/ui/Modal`).
- [ ] **Step 6: Run** `cd backend && npm test && cd ../frontend && npm test && npm run build` — Expected: all pass, build clean; `npx oxlint` clean.
- [ ] **Step 7: Commit** `eBay sections: drill-downs, generic actions, multi-select and file fields`.

### Task 2: Promoted Listings section — campaigns

**Files:**
- Create: `backend/marketplaces/ebay/sections/advertising.js`, `frontend/src/marketplaces/ebay/sections/advertising/AdvertisingPage.jsx`
- Modify: `backend/marketplaces/ebay/sections/index.js` (`advertising`), `backend/marketplaces/ebay/profile.js` (section `{ id: 'advertising', label: 'Promoted Listings', path: '/ebay/advertising', route: 'products', needs: 'sell.marketing scope', probe: (t) => ebayRest(t, '/sell/marketing/v1/ad_campaign?limit=1') }`), `frontend/src/marketplaces/ebay/index.js` (page + subsection `{ id: 'advertising', route: 'products', label: 'Promoted Listings', desc: 'Ad campaigns, ad rates and ad results' }`, after `promotions`)
- Test: `backend/marketplaces/ebay/test/sections-advertising.test.js`

**Interfaces:**
- Consumes: Task 1 `actions` / `details`.
- Produces: loader `advertising(token, shop) → { summary, tables }`; table `campaigns` (tab `Campaigns`), row `id = campaignId`, `raw = { status, fundingModel }`; `advertising.actions` and `advertising.details` objects later tasks extend.

- [ ] **Step 1: Write the failing tests:** `campaigns list every page with type, status, rate and budget` (two pages of `GET /sell/marketing/v1/ad_campaign?limit=100&offset=…`; columns name, type `General (cost per sale)` / `Priority (cost per click)` from `fundingStrategy.fundingModel`, status, ad rate `bidPercentage` %, daily budget `budget.daily.amount`, start, end); `running campaigns offer Pause and End, paused offer Resume and End, ended offer none`; `pause, resume and end call eBay for that campaign` (`POST …/ad_campaign/{id}/pause|resume|end`); `rename and budget call eBay` (`update_campaign_identification {campaignName}`; `update_campaign_budget {daily:{amount:{value,currency}}}` only for COST_PER_CLICK rows); tiles `Running`, `Paused`, `Ended (last 90 days)`.
- [ ] **Step 2: Run** `cd backend && node --test marketplaces/ebay/test/sections-advertising.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the loader and `actions.pause|resume|end|rename|budget` (End has a confirm: `End campaign "<name>"? Its ads stop and it can't be restarted.`). `AdvertisingPage.jsx` is `<SectionView sectionId="advertising" title="Promoted Listings" />`.
- [ ] **Step 4: Run** the test, then `npm run -s api-coverage && npm test`, frontend `npm test && npm run build` — Expected: pass.
- [ ] **Step 5: Commit** `eBay Promoted Listings: campaigns`.

### Task 3: Ads in a campaign, with eBay's suggested ad rates

**Files:** Modify `backend/marketplaces/ebay/sections/advertising.js`. Test: `sections-advertising.test.js`.

**Interfaces:**
- Consumes: Task 2 rows; the shop's eBay listings from the `Listing` model (`marketplace: 'ebay'`, `shopId`, `externalListingId`, product title).
- Produces: `details.ads`, `actions['add-listings']`, `actions['remove-listings']`, `actions['set-rate']`; helper `suggestedRates(token, listingIds) → Map<listingId, number>`.

- [ ] **Step 1: Write the failing tests:**
  - `a campaign's ads are listed across pages with titles` (`GET /sell/marketing/v1/ad_campaign/{id}/ad?limit=500&offset=…`; rows listing id, title from Listings or `—`, ad rate, status).
  - `eBay's suggested rate comes from the Recommendation API` (`POST /sell/recommendation/v1/find?filter=recommendationTypes:%7BAD%7D` with `{ listingIds }`, max 500 per call; the `ITEM` basis `bidPercentages` value is used, else the first; listing without advice → none).
  - `the Add listings input offers the shop's listings not in the campaign, marking eBay's suggestions` (options from Listings minus current ads; `GET /sell/marketing/v1/ad_campaign/{id}/suggest_items` ids get label suffix `(suggested by eBay)` and come first; field `rate` optional: empty = each listing's suggested rate, else that rate for all).
  - `adding 1,200 listings goes in three batches and reports refusals` (`POST …/bulk_create_ads_by_listing_id {requests:[{listingId,bidPercentage}]}` ×3; responses with `errors` → `refused: [{listingId, reason}]`; message `Added N listings. Not added: …`).
  - `remove and set rate act on the chosen listings` (`bulk_delete_ads_by_listing_id {requests:[{listingId}]}`; `bulk_update_ads_bid_by_listing_id {requests:[{listingId,bidPercentage}]}`; rate must be 2–100, else 400 before eBay).
  - Actions offered only on General (COST_PER_SALE) campaigns that aren't ENDED; Priority campaigns show the ads detail only.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Ad rate bounds 2.0–100.0 (eBay's CPS limits), sent as a string with one decimal.
- [ ] **Step 4: Run** test, coverage, full suites — Expected: pass.
- [ ] **Step 5: Commit** `eBay Promoted Listings: ads and suggested ad rates`.

### Task 4: Create and copy General campaigns

**Files:** Modify `advertising.js`. Test: `sections-advertising.test.js`.

**Interfaces:** Consumes Task 3 `suggestedRates` and the add-listings batching. Produces table action `create` on `campaigns`, row action `clone`.

- [ ] **Step 1: Write the failing tests:**
  - `creating a campaign sends a cost-per-sale campaign and adds the chosen listings` (`POST /sell/marketing/v1/ad_campaign` with `{ campaignName, marketplaceId: 'EBAY_US', startDate, endDate?, fundingStrategy: { fundingModel: 'COST_PER_SALE', bidPercentage } }`; id read back with `GET /sell/marketing/v1/ad_campaign/get_campaign_by_name?campaign_name=`; then the Task 3 batch add).
  - `a name already used is refused before eBay is asked to create` (`get_campaign_by_name` finds one → 400 `A campaign named "<x>" already exists.`).
  - `copy makes a new campaign from an existing one` (`POST …/ad_campaign/{id}/clone` with `{ campaignName, startDate, fundingStrategy }` copied from the source).
  - Start date defaults to now; end date optional; a past start date → 400.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (input fields: name, ad rate % optional = eBay's suggestion per listing, start date, end date optional, listings `multiple`).
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay Promoted Listings: create and copy campaigns`.

### Task 5: Ad reports

**Files:** Modify `advertising.js`. Test: `sections-advertising.test.js`.

**Interfaces:** Produces table `reports` (tab `Reports`), table action `request-report`, row detail `report`, row action `delete-report`; helper `readReport(buffer) → { columns, rows }` (gunzip if gzip magic bytes, TSV with a header line).

- [ ] **Step 1: Write the failing tests:**
  - `report tasks are listed with status` (`GET /sell/marketing/v1/ad_report_task?limit=50`; columns type, period, status, requested, `actions` View only when `reportTaskStatus === 'SUCCESS'`; `FAILED` shows `reportTaskStatusMessage`).
  - `requesting a report uses eBay's metrics for that report type` (`GET /sell/marketing/v1/ad_report_metadata/{type}` → all `metricMetadata[].metricKey` and the first `dimensionMetadata[].dimensionKey`; `POST /sell/marketing/v1/ad_report_task` `{ reportType, dateFrom, dateTo, marketplaceId:'EBAY_US', fundingModels:['COST_PER_SALE'], dimensions:[{dimensionKey}], metricKeys, reportFormat:'TSV_GZIP' }`; types offered: `CAMPAIGN_PERFORMANCE_REPORT`, `LISTING_PERFORMANCE_REPORT`, `ACCOUNT_PERFORMANCE_REPORT`; period 7/30/90 days).
  - `a finished report opens as a table` (`GET /sell/marketing/v1/ad_report/{reportId}` returns gzipped TSV → columns from the header, numbers kept as numbers).
  - `a report over 500 rows shows the first 500 and says so`.
  - `deleting a report task calls eBay` (`DELETE /sell/marketing/v1/ad_report_task/{id}`; needs an `ebaySend` DELETE).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** The report download needs the raw body: add `ebayFetchBuffer(token, url) → Buffer` to `marketplaces/ebay/client.js` (same headers as `ebayFetch`, `Accept: */*`).
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay Promoted Listings: ad reports`.

### Task 6: Payment disputes — detail, evidence files, contest

**Files:** Modify `backend/marketplaces/ebay/sections/returns-cases.js` (details), `sections/returnsActions.js` (actions), `marketplaces/ebay/client.js` (`ebayUpload`), `app/routes/sections.js` (evidence download). Test: `backend/marketplaces/ebay/test/returns-disputes.test.js`.

**Interfaces:**
- Consumes: Task 1 `details` and the file field value `{ name, type, size, dataUrl }`.
- Produces: `returnsCases.details.dispute`; ACTIONS `dispute-evidence`, `dispute-contest`; `ebayUpload(token, url, { name, type, buffer }) → body` (multipart, field name `file`); route `GET /api/ebay/sections/returns-cases/dispute-file?id=&evidenceId=&fileId=` streams `fetch_evidence_content` (`Cache-Control: no-store`).

- [ ] **Step 1: Write the failing tests:**
  - `a dispute's detail shows eBay's evidence requests, evidence on file and history` (`GET {apiz}/sell/fulfillment/v1/payment_dispute/{id}` + `/activity`).
  - `adding evidence uploads the file then adds it to the dispute` (`POST {apiz}/…/payment_dispute/{id}/upload_evidence_file` multipart `file` → `fileId`; then `add_evidence {evidenceType, files:[{fileId}], lineItems}` with the dispute's line items, or `update_evidence {evidenceId, evidenceType, files, lineItems}` when an evidence set of that type exists).
  - `a PDF or a 6 MB file is refused before eBay is called` (JPEG/PNG only, ≤ 5 MB decoded).
  - `contesting sends the dispute's revision and note` (`POST …/contest {revision, note, returnAddress?}`; returnAddress from the dispute when eBay asked for it).
  - `a contested dispute, or one without CONTEST in availableChoices, offers no evidence or contest buttons`.
  - `the evidence file download streams eBay's file without storing it`.
  - Evidence types offered (eBay `EvidenceTypeEnum`): `PROOF_OF_DELIVERY`, `PROOF_OF_AUTHENTICITY`, `PROOF_OF_ITEM_AS_DESCRIBED`, `PROOF_OF_PICKUP`, `TRACKING_INFORMATION`.
- [ ] **Step 2: Run** `node --test marketplaces/ebay/test/returns-disputes.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** Rows of the existing Payment disputes table gain `{ id:'dispute', label:'Details', detail:true }` and, when open and contestable, `dispute-evidence` (fields evidenceType, file `accept="image/jpeg,image/png"`) and `dispute-contest` (confirm + optional note).
- [ ] **Step 4: Run** test, coverage, full suites — Expected: pass.
- [ ] **Step 5: Commit** `eBay payment disputes: evidence files and contest`.

### Task 7: Returns — detail, messages, photos, label, escalation

**Files:** Modify `returns-cases.js`, `returnsActions.js`. Test: `backend/marketplaces/ebay/test/returns-post-order.test.js`.

**Interfaces:** Produces `details.return`; ACTIONS `return-message`, `return-photo`, `return-label`, `return-escalate`.

- [ ] **Step 1: Write the failing tests:**
  - `a return's detail shows its history, files and tracking` (`GET /post-order/v2/return/{id}` (summary + `detail.responseHistory`), `/files`, `/tracking`; all with `iaf`).
  - `a message to the buyer is sent on the return` (`POST /post-order/v2/return/{id}/send_message {message:{content}}`; 1–1000 characters, else 400 before eBay).
  - `a photo is uploaded then submitted` (`POST /post-order/v2/return/{id}/file/upload {fileName, data: <base64>, filePurpose:'ITEM_RELATED'}` then `POST /post-order/v2/return/{id}/file/submit {filePurpose:'ITEM_RELATED'}`; JPEG/PNG ≤ 5 MB).
  - `sending a return label passes carrier and tracking` (`POST /post-order/v2/return/{id}/add_shipping_label {carrierEnum, trackingNumber}` with carriers from the existing `CARRIERS`).
  - `escalating asks eBay to step in with the chosen reason` (`POST /post-order/v2/return/{id}/escalate {reason, comments}`; reasons offered: `BUYER_RETURNED_WRONG_ITEM`, `BUYER_DAMAGED_ITEM`, `BUYER_STILL_UNHAPPY_AFTER_REFUND`, `OTHERS`).
  - Closed or refunded returns offer only Details.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay returns: messages, photos, return label, escalation`.

### Task 8: Inquiries and cases — detail, messages, escalation, appeal

**Files:** Modify `returns-cases.js`, `returnsActions.js`. Test: `returns-post-order.test.js`.

**Interfaces:** Produces `details.inquiry`, `details.case`; ACTIONS `inquiry-message`, `inquiry-escalate`, `case-appeal`. Case rows gain `id = caseId`.

- [ ] **Step 1: Write the failing tests:**
  - `an inquiry's detail shows its history` (`GET /post-order/v2/inquiry/{id}`).
  - `a message is sent on the inquiry` (`POST /post-order/v2/inquiry/{id}/send_message {message:{content}}`).
  - `escalating an inquiry passes the reason and comment` (`POST /post-order/v2/inquiry/{id}/escalate {escalateInquiryReason, comments}`; reasons offered: `BUYER_STILL_UNHAPPY_AFTER_REFUND`, `TROUBLE_COMMUNICATION_WITH_BUYER`, `OTHERS`).
  - `a case's detail shows its status, decision and history` (`GET /post-order/v2/casemanagement/{caseId}`).
  - `only a decided case can be appealed` (row action `case-appeal` only when status is CLOSED with a decision against the seller; `POST /post-order/v2/casemanagement/{caseId}/appeal {appealReason, comments}`; reasons `DISAGREE_WITH_FINAL_DECISION`, `NEW_INFORMATION`, `OTHER`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** The Cases table also loads closed cases from the last 90 days (`case_status_filter=CLOSED`) so appeals are reachable.
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay inquiries and cases: messages, escalation, appeal`.

### Task 9: Leave feedback for buyers

**Files:** Modify `backend/marketplaces/ebay/sections/buyers.js`. Test: `backend/marketplaces/ebay/test/sections-buyers.test.js`.

**Interfaces:** Produces table `awaiting` (tab `Feedback`), row action `leave-feedback`.

- [ ] **Step 1: Write the failing tests:** `orders waiting for your feedback are listed` (`GET /commerce/feedback/v1/awaiting_feedback?filter=role:SELLER&limit=50`, all pages); `leaving feedback sends a positive rating and the comment` (`POST /commerce/feedback/v1/feedback` with the line item id from the row, rating positive — sellers can only leave positive feedback for buyers; comment 1–80 characters, else 400 before eBay; field names exactly as `commerce_feedback_v1_beta_oas3.json` `LeaveFeedbackRequest`); without `commerce.feedback` the table shows the reconnect message.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay buyers: leave feedback`.

### Task 10: Seller standards detail, payout detail, transaction totals, promotion items

**Files:** Modify `sections/analytics.js`, `sections/payouts.js`, `sections/promotions.js`. Tests: their `sections-*.test.js`.

**Interfaces:** Produces `analytics.details.standards`, `payouts.details.payout`, `promotions.details.items`, `promotions.actions.delete`.

- [ ] **Step 1: Write the failing tests:**
  - `a seller level row opens its metrics` (`GET /sell/analytics/v1/seller_standards_profile/{program}/{cycle}` → table metric, value, threshold, level).
  - `a payout opens with its transactions` (`GET {apiz}/sell/finances/v1/payout/{id}` + `transaction?filter=payoutId:{id}`).
  - `the Payouts tab shows credits, debits and on hold` (`GET {apiz}/sell/finances/v1/transaction_summary?filter=transactionDate:[90 days]` → tiles).
  - `a promotion opens with its listings` (`GET /sell/marketing/v1/promotion/{id}/get_listing_set`).
  - `a draft or ended promotion can be deleted` (`DELETE /sell/marketing/v1/item_promotion/{id}` or `/item_price_markdown/{id}` by promotion type; running ones aren't offered).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `eBay: seller standards, payout detail, promotion items`.

### Task 11: Who pays shipping — eBay listing backend

**Files:**
- Modify: `backend/marketplaces/ebay/trading.js` (`parseItem`, `listingTemplate`, `shippingXml`, `addListing`, `reviseListing`), `backend/marketplaces/ebay/app/services/products.js` (pass `ebayShipping` through list and edit), `backend/models/Product.js` (field `ebayShipping: { paidBy: { type: String, enum: ['buyer', 'seller'] }, cost: Number }`, optional — products without it keep today's behaviour)
- Test: `backend/marketplaces/ebay/test/shipping-payer.test.js`

**Interfaces:**
- Produces: `ebayShipping = { paidBy: 'buyer' | 'seller', cost?: number }` on the list request (`opts.ebayShipping`), the edit request (`changes.ebayShipping`) and the product. `parseItem(item).shipping = { paidBy, cost, type: 'Flat' | 'Calculated', policy: string | null }` read from eBay's listing: `paidBy = 'seller'` when the first domestic service (priority 1) has `FreeShipping=true`, else `'buyer'`; `cost` = that service's `ShippingServiceCost`; `policy` = `SellerProfiles.SellerShippingProfile.ShippingProfileName` when present.
- Rules (eBay's): free shipping is set on the first domestic service only (`<FreeShipping>true</FreeShipping>`, cost `0.00`); other services and international options keep their own costs. Buyer pays on a **Flat** listing needs a cost ≥ 0.01 (written to the first service's `ShippingServiceCost`); on a **Calculated** listing the buyer pays eBay's calculated rate and no cost is taken. No `ebayShipping` given → the template/listing's shipping is sent unchanged (today's behaviour).

- [ ] **Step 1: Write the failing tests:**
  - `a new listing with free shipping marks only the first service free` (template with two Flat services $4.99 / $9.99 → XML has `FreeShipping` and cost `0.00` on priority 1, $9.99 kept on priority 2).
  - `a new listing where the buyer pays uses the given cost` (`{ paidBy:'buyer', cost: 6.5 }` → priority-1 cost `6.50`, no `FreeShipping`).
  - `buyer pays on a Flat listing without a cost is refused before eBay` (400 `Enter the shipping cost the buyer pays.`).
  - `buyer pays on a Calculated listing sends no cost`.
  - `editing a listed product changes only who pays shipping` (`reviseListing(token, id, { ebayShipping })` reads the listing's current `ShippingDetails` with `GetItem`, rewrites priority 1, and sends `ReviseFixedPriceItem` with `<ShippingDetails>` (all services kept) — no title, price or quantity tags).
  - `a listing on a shipping policy is refused with the policy's name` (GetItem has `SellerProfiles.SellerShippingProfile.ShippingProfileName = 'Std'` → 400 `This listing uses your eBay shipping policy "Std". Change who pays shipping in that policy in Seller Hub.`; no ReviseFixedPriceItem call).
  - `the listing's current payer is read from eBay` (`parseItem` → `shipping.paidBy/cost/type/policy`), and a listings sync saves it to `product.ebayShipping` (`paidBy`, `cost`).
- [ ] **Step 2: Run** `cd backend && node --test marketplaces/ebay/test/shipping-payer.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** `shippingXml(template, product, opts)` applies `opts.ebayShipping ?? product.ebayShipping` to a copy of `template.shippingOptions`; `reviseListing` adds the shipping part only when `changes.ebayShipping` is given (combined into the same `ReviseFixedPriceItem` call as other changed fields).
- [ ] **Step 4: Run** the test, then `npm test` — Expected: pass.
- [ ] **Step 5: Commit** `eBay listings: who pays shipping (backend)`.

### Task 12: Who pays shipping — listing forms

**Files:**
- Create: `frontend/src/marketplaces/ebay/sections/listings/listing/ShippingPayerField.jsx`, `frontend/src/marketplaces/ebay/sections/listings/listing/shippingPayer.js` (`validateShippingPayer(value, type) → string | ''`, `cleanShippingPayer(value) → { paidBy, cost? }`)
- Modify: `hooks/useListForm.js` + `ListModal.jsx` (list a dashboard product), `hooks/useDirectListing.js` + `DirectListModal.jsx` (new listing straight to eBay), `ProductModal.jsx` (edit a listed product)
- Test: `frontend/test/ebay-sections.test.mjs`

**Interfaces:** Consumes Task 11's `ebayShipping` and `shipping` (from the product / listing). The field: two radio buttons **Buyer pays shipping** / **Free shipping (I pay)**; with Buyer pays on a Flat listing, a **Shipping cost ($)** input. On a Calculated listing it says *Buyer pays eBay's calculated rate*. When the listing is on a shipping policy, the field is read-only and names the policy.

- [ ] **Step 1: Write the failing tests:** `buyer pays needs a cost on a flat listing` (`validateShippingPayer({paidBy:'buyer', cost:''}, 'Flat')` → `'Enter the shipping cost the buyer pays.'`; `'Calculated'` → `''`); `free shipping drops the cost` (`cleanShippingPayer({paidBy:'seller', cost:'5'})` → `{ paidBy: 'seller' }`); `cost is sent as a number` (`{paidBy:'buyer', cost:'6.50'}` → `{ paidBy:'buyer', cost: 6.5 }`).
- [ ] **Step 2: Run** `cd frontend && npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and field; wire it into the three forms next to the Best Offer field, defaulting to the product's `ebayShipping` (list/edit) or **Buyer pays** with an empty cost (direct new listing). The edit form sends `ebayShipping` only when the seller changed it.
- [ ] **Step 4: Run** `npm test && npm run build` (frontend) and backend `npm test` — Expected: pass.
- [ ] **Step 5: Commit** `eBay listings: who pays shipping (forms)`.

### Task 13: Coverage pin and docs

**Files:** Modify `backend/test/api-coverage.test.js`, `backend/marketplaces/README.md` (eBay part).

- [ ] **Step 1: Write the test** `eBay wave 2 endpoints are covered` listing every endpoint named in Tasks 2–10 (as `METHOD /path` ids from `shopCoverage('ebay')`) and asserting each status starts with `covered`.
- [ ] **Step 2: Run** `npm run -s api-coverage && node --test test/api-coverage.test.js` — Expected: PASS (if one fails, its call site is missing the full path).
- [ ] **Step 3: Document** in the README: the eBay generic detail/action routes, Promoted Listings, the evidence download route, that uploads aren't stored, and the `ebayShipping` rules.
- [ ] **Step 4: Run** both full suites and the build — Expected: green.
- [ ] **Step 5: Commit** `eBay wave 2: coverage and docs`.

---

## Decided here (you may change these at review)

- **Priority (cost-per-click) campaigns:** listed, paused/resumed/ended, budget and name changed, ads shown — but **creating** them and keyword / ad-group management (suggest bids, suggest keywords, negative keywords) are left for later: they need a keyword-research screen of their own. General (cost-per-sale) campaigns are fully managed.
- **Who pays shipping** covers the delivery charge only. Who pays **return** shipping stays as it is today (copied from your listing's return policy); it can be added the same way if the client wants it.
- **Ad reports** use eBay's report tasks (eBay builds them in the background); the page shows their status and opens a finished one as a table. No automatic polling.
- **Evidence files** go through the dashboard to eBay without being saved. Limit 5 MB, JPEG/PNG (eBay disputes accept only those).
- **Not in this wave (wave 3, on request):** business policies, notification subscriptions, bulk feed tasks, media/video uploads, parts compatibility, eBay shipping labels (Logistics API, US-only beta), Trading member messages, catalog/taxonomy pre-fill, order earnings per order (eBay refuses the scope).
