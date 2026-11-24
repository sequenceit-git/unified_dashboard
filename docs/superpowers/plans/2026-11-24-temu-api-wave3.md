# Temu API Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Temu a full shop in the dashboard: list new goods from the dashboard (category, attributes, variants, photos, shipping template) and edit or delete them, fill in compliance, follow orders end to end (cancellations, appeals, tracking, combined shipping), buy and print Temu shipping labels, handle return shipping, run ads, edit promotion enrolments, and show Temu-specific analytics.

**Architecture:** Everything lives in Temu's own folders (`backend/marketplaces/temu/`, `frontend/src/marketplaces/temu/`). Listing uses Temu's documented release flow (`bg.local.goods.cats.get` → `bg.local.goods.template.get` → image upload → `bg.local.goods.add`); a pure payload builder turns the dashboard form into Temu's `goodsBasic / goodsServicePromise / goodsProperty / skuList` body. Section work reuses Temu's own `SectionView` with `details` / `actions` (wave 1). Every new Temu method is wrapped in `grantAware(shop, method, load)` so a method the app isn't granted says how to enable it.

**Tech Stack:** Node 24, Express 5, node:test + `test/helpers/stub.js`; React + Vite; oxlint.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-api-rollout-design.md` (its Temu wave 2: "create/edit/delete goods; buy shipping labels"), extended at the user's request to analytics, the listing form, order management and the other Temu sections. Temu's reference: the public mirror of partner.temu.com in the session scratchpad `temu-docs/` (`api-reference/<group>/<method>.md`, `api-integration-guide/18-add-products-guide.md`, `19-add-products-guide-v2.md`, `20-parent-child-attribute-guide.md`, `24-product-materials-upload.md`, `25-product-update-guide.md`, `37-order-fulfillment-guide.md`, `38-split-and-ship-a-package-examples.md`, `40-temu-logistics-tracking-api-documentation.md`, `41-return-and-refund-guide.md`, `43-ads-introduction.md`, `product/00-how-to-release-product.md`).

## Global Constraints

- Shops are independent: nothing under `marketplaces/temu/` imports eBay or TikTok code; `frontend/test/temu-sections.test.mjs` keeps its independence guard.
- Every Temu method name is written in full at its `temu.call('<method>', …)` site (coverage extractor). `npm run api-coverage` after each task; methods missing from the Temu catalog are added there.
- Every new call goes through `grantAware(shop, '<method>', load)`; a shop without a stored granted list is never blocked.
- Temu amounts are whole currency units (as wave 1); the region is US (`regionId: 211`).
- Lists Temu pages are read across all pages (cap 20); one item's error never aborts a batch — it is reported per item.
- Failed actions keep their dialog open; detail/action names are looked up with `Object.hasOwn` only.
- Files sent for Temu (photos, certificates, labels) travel as data URLs in JSON and are never stored or logged; images JPEG/PNG ≤ 3 MB (Temu's limit), PDFs ≤ 10 MB.
- Commands chain with `&&`. Commit per task to `main` and push.

## Review Focus

1. A goods add Temu refuses (category not a leaf, attribute missing, illegal word) shows Temu's reason in the form, which keeps everything typed; nothing is saved as listed. (Task 3 test `a refused add keeps the form and shows Temu's reason`.)
2. A category whose template has required parent/child attributes: a child attribute only appears and is only sent when its parent value triggers it. (Task 2 test.)
3. Buying a label for a package Temu has no service for, or a purchase Temu is still processing, says so; it never shows "bought" before `bg.logistics.shipment.result.get` confirms. (Task 7 tests.)
4. Deleting goods with open orders or on an active promotion: Temu's refusal is shown, and the dashboard listing stays. (Task 4 test.)
5. A sub-admin without Goods or Orders gets 403 on every new route; helper routes only serve the connected Temu shop. (Task 1 test.)

---

### Task 1: Listing helpers (categories, template, uploads, checks)

**Files:**
- Create: `backend/marketplaces/temu/app/services/goodsHelpers.js`, routes in `backend/marketplaces/temu/app/routes/products.js` (before `/:id`)
- Test: `backend/marketplaces/temu/app/test/goods-helpers.test.js`

**Interfaces:**
- Produces routes (all `limitToSection('goods')`, connected Temu shop of the user):
  - `GET /api/temu/goods-helpers/categories?parentId=` → `[{ id, name, leaf, apparel, available }]` (`bg.local.goods.cats.get`; `available = availableStatus === 0`)
  - `GET /api/temu/goods-helpers/categories/recommend?title=` → `[{ id, path }]` (`bg.local.goods.category.recommend`)
  - `GET /api/temu/goods-helpers/template?catId=` → `{ attributes: Attr[], variants: Attr[], sizeChart: { required } }` from `bg.local.goods.template.get` (+ `bg.local.goods.size.element.get`), where `Attr = { pid, refPid, templatePid, name, required, multiple, values: [{ vid, value }], units: [{ id, name }], parent: { pid, vids } | null, inputMax }` (`isSale` splits attributes from variants; `showType 1` + its parent's trigger values fill `parent`)
  - `POST /api/temu/goods-helpers/spec {catId, parentSpecId, name}` → `{ specId }` (`bg.local.goods.spec.id.get`)
  - `POST /api/temu/goods-helpers/images {files:[{name,dataUrl}], apparel}` → `[{ name, url }]` (`bg.local.goods.image.upload`; JPEG/PNG ≤ 3 MB, checked by bytes; apparel 3:4 vs 1:1 left to Temu's answer)
  - `GET /api/temu/goods-helpers/shipping-templates` → `[{ id, name }]` (`bg.freight.template.list.query`)
  - `GET /api/temu/goods-helpers/brands` → `[{ brandId, trademarkId, name }]` (`temu.local.goods.brand.trademark.V2.get`)
  - `GET /api/temu/goods-helpers/tax-codes?catId=` (`bg.local.goods.tax.code.get`), `GET …/net-units` (`temu.local.goods.sku.net.content.unit.query`)
  - `POST /api/temu/goods-helpers/check {title, description, bulletPoints, outGoodsSn, skus:[outSkuSn]}` → `{ problems: [{ field, message }] }` (`temu.local.goods.illegal.vocabulary.check`, `bg.local.goods.out.sn.check`, `bg.local.goods.sku.out.sn.check`)

- [ ] **Step 1: Failing tests:** `categories map Temu's tree and mark sellable leaves`; `a template splits attributes and variants and links children to their parent values`; `images are uploaded as Temu urls and a PDF or 4 MB image is refused before Temu`; `the check lists every illegal word and duplicate code with its field`; `a sub-admin without Goods gets 403 and a shop without the method granted gets the enable message`.
- [ ] **Step 2: Run** `cd backend && node --test marketplaces/temu/app/test/goods-helpers.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (helpers cached 10 min per shop + category: categories, template, brands, templates).
- [ ] **Step 4: Run** the test, `npm run -s api-coverage && npm test` — Expected: pass.
- [ ] **Step 5: Commit** `Temu listing helpers: categories, template, uploads, checks`.

### Task 2: The Temu goods payload builder

**Files:** Create `backend/marketplaces/temu/goodsPayload.js`. Test: `backend/marketplaces/temu/test/goods-payload.test.js`.

**Interfaces:**
- Produces `buildGoodsAdd(form, template) → { goodsBasic, goodsServicePromise, goodsProperty, skuList, bulletPoints?, goodsDesc?, goodsTrademark?, taxCodeInfo?, goodsOriginInfo }` and `formErrors(form, template) → [{ field, message }]`.
- `form = { catId, title, description, bulletPoints: string[], outGoodsSn, images: url[], shippingTemplateId, handlingDays, attributes: { [pid]: { vids?: number[], value?: string, unitId? } }, variants: [{ specs: [{ parentSpecId, specId }], outSkuSn, basePrice, listPrice?, quantity, weight, weightUnit: 'lb'|'oz'|'g'|'kg', length, width, height, volumeUnit: 'in'|'cm', images: url[], externalProductType?, externalProductId? }], brand?: { brandId, trademarkId }, taxCode?, origin: { region1, region2? } }`.
- Rules (from `00-how-to-release-product.md`): title ≤ 500 English chars; ≤ 6 bullet points, ≤ 700 chars total; description ≤ 10,000; `fulfillmentType: 1`; required attributes per template; a child attribute only when its parent has a trigger value; quantity 0–999,999; listPrice ≥ basePrice when given; each SKU at least one image.

- [ ] **Step 1: Failing tests:** `a single-SKU goods builds Temu's add body`; `variants become skuList with their spec ids`; `a child attribute is sent only when its parent value triggers it`; `missing required attributes, a long title and listPrice below basePrice are listed by field`; `amounts are whole units, not cents`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (pure; no Temu calls).
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `Temu goods payload builder`.

### Task 3: List new goods on Temu (backend + form)

**Files:**
- Modify: `backend/marketplaces/temu/listings.js` (`createListing`), `backend/marketplaces/temu/client.js` (`listingCapabilities.canList: true`), `backend/marketplaces/temu/profile.js` (`productForm.directIntro` text), `app/services/products.js` (list route passes `temuForm`)
- Modify (frontend, Temu's own): `frontend/src/marketplaces/temu/sections/goods/ListModal.jsx`, `DirectListModal.jsx`, `hooks/useListForm.js`, `hooks/useDirectListForm.js`; Create `frontend/src/marketplaces/temu/sections/goods/listing/{CategoryPicker.jsx,TemplateFields.jsx,TemuVariants.jsx,TemuImages.jsx,temuForm.js}`
- Test: `backend/marketplaces/temu/test/goods-create.test.js`, `frontend/test/temu-sections.test.mjs`

**Interfaces:** Consumes Task 1 routes and Task 2 `buildGoodsAdd` / `formErrors`. `createListing(token, product, { temuForm })` → runs `bg.local.goods.compliance.property.check`, then `bg.local.goods.add`; returns `{ externalListingId: '<goodsId>:<firstSkuId>', status: 'pending', variants }` (Temu reviews new goods). Frontend `temuForm.js`: `formFromProduct(product)`, `validate(form, template)` (mirrors `formErrors`), `toRequest(form)`.

- [ ] **Step 1: Failing tests:** backend `a new goods is checked then added and saved as under review`; `a refused add keeps the form and shows Temu's reason` (the route answers 422 with Temu's message and per-field problems; no Listing is marked live); `goods ids come back as goodsId:skuId for every SKU`. Frontend `a child attribute field shows only after its parent value is chosen`; `the form keeps values after a refused add`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Form order: category (search + recommend from the title) → template attributes → variants (Temu's variant attributes; custom values via Task 1 spec route) → photos (uploaded on pick) → price, stock, weight, size per SKU → shipping template + handling days → origin, brand, tax code (optional) → Check (Task 1) → List on Temu.
- [ ] **Step 4: Run** backend + frontend suites and build — Expected: pass.
- [ ] **Step 5: Commit** `Temu goods: list new goods from the dashboard`.

### Task 4: Edit and delete goods

**Files:** Modify `backend/marketplaces/temu/listings.js` (`reviseListing`, `removeListing`), `client.js` (`editAfterListing: ['title','description','images','attributes','bulletPoints']`), Temu `ProductModal.jsx`. Test: `backend/marketplaces/temu/test/goods-edit.test.js`.

**Interfaces:** `reviseListing(token, externalListingId, changes)` → `bg.local.goods.partial.update` for title/description/bullet points/images, `temu.local.goods.attributes.edit` for attributes; price/stock keep their existing calls. `removeListing` → `temu.local.goods.delete`. Pre-sale on/off → `temu.local.goods.pre.sale.status.edit` (goods-detail panel action).

- [ ] **Step 1: Failing tests:** `a title or photo edit sends a partial update of only those fields`; `an attribute edit uses Temu's attribute call`; `deleting goods Temu refuses keeps the dashboard listing and shows why`; `pre-sale can be turned on and off`.
- [ ] **Step 2: Run** — Expected: FAIL.  **Step 3: Implement.**  **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** `Temu goods: edit and delete`.

### Task 5: Compliance

**Files:** Modify `backend/marketplaces/temu/app/services/products.js` (+ routes) and Temu's `GoodsPage.jsx` (a **Compliance** tab inside Goods, no new sidebar section) and `TemuDetail.jsx`. Test: `backend/marketplaces/temu/app/test/goods-compliance.test.js`.

**Interfaces:** `GET /api/temu/goods-compliance` → goods that need compliance info (`bg.local.compliance.goods.list.query`, `bg.arbok.open.cert.queryNeedUploadItems`) with what each needs (`bg.local.goods.compliance.rules.get`, `bg.local.goods.compliance.extra.template.get`); `POST /api/temu/goods/:goodsId/compliance` fills info (`bg.local.goods.compliance.info.fill.list.query` → `temu.local.goods.compliance.v2.edit`); `POST /api/temu/goods/:goodsId/certificates {type, file}` → `bg.arbok.open.upload.uploadFile` then `bg.arbok.open.cert.uploadProductCert`; certificates on file via `bg.arbok.open.product.cert.query`; compliance label via `bg.goods.compliancelabel.get`.

- [ ] **Step 1: Failing tests:** `goods missing compliance are listed with what Temu needs`; `a certificate PDF is uploaded then attached`; `filled compliance info is sent with Temu's field ids`; `a 12 MB certificate is refused before Temu`.
- [ ] **Steps 2–4** as above.  **Step 5: Commit** `Temu goods: compliance and certificates`.

### Task 6: Order management

**Files:** Modify `backend/marketplaces/temu/app/services/orders.js` (+ routes), Temu `TemuOrderDetail.jsx`, `OrdersPage.jsx`. Test: `backend/marketplaces/temu/app/test/order-manage.test.js`.

**Interfaces:**
- Order detail gains: tracking events (`temu.track.trackinginfo.get`), customisation (`bg.order.customization.get`), cancellation result (`temu.order.cancel.outofstock.result.get`).
- `POST /api/temu/orders/:id/cancel-appeal {reason}` → `temu.order.cancel.appeal.apply`; result via `temu.order.cancel.appeal.result.get` in the detail.
- `GET /api/temu/orders/combine` → orders that can ship together (`bg.order.combinedshipment.list.get`) and unshipped packages (`bg.order.unshipped.package.get`), shown as an Orders tab "Ship together".
- `POST /api/temu/orders/:id/verification {file}` → `temu.local.order.verification.upload` (when Temu asks for it).

- [ ] **Step 1: Failing tests:** `an order shows its tracking events newest first`; `a customised order shows the buyer's customisation`; `an out-of-stock cancellation shows Temu's result and can be appealed once`; `orders that can ship together are grouped by Temu's combine key`; route access 403 for a sub-admin without Orders.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu orders: tracking, customisation, cancellation appeals, ship together`.

### Task 7: Buy Temu shipping labels

**Files:** Modify `backend/marketplaces/temu/sections/shipping.js` (details/actions), `backend/marketplaces/temu/orders.js`; Temu `ShippingPage.jsx` and `OrderDrawer.jsx` (Buy label button). Test: `backend/marketplaces/temu/test/shipping-labels.test.js`.

**Interfaces:** `actions['buy-label']` on an order/package: `bg.logistics.shippingservices.get` (services + price for the package weight/size) → seller picks one → `bg.logistics.shipment.create` → poll `bg.logistics.shipment.result.get` (up to 5 × 2 s) → `{ message, packageSn, trackingNumber }` or "Temu is still buying the label — refresh in a minute"; `details.label` → `bg.logistics.shipment.document.get` (label PDF url, opened in a new tab); `actions['change-shipping']` → `bg.logistics.shipment.update` / `bg.logistics.shipment.shippingtype.update`; split shipments: `bg.logistics.shipment.sub.confirm`, `bg.logistics.shipped.package.confirm`, `bg.logistics.shipment.v2.get`. Pickup: `temu.logistics.shipment.pickup.reservation.create|cancel|result.get`, label list `temu.logistics.label.list.get`, logistics types `temu.logistics.shiplogisticstype.get`.

- [ ] **Step 1: Failing tests:** `services are listed with their price for the package`; `buying waits for Temu's result and never says bought before it confirms`; `a package with no service says so`; `the label opens Temu's document url`; `a split shipment confirms each sub-package`; `a pickup can be booked and cancelled`.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu shipping: buy labels, split shipments, pickups`.

### Task 8: Return shipping

**Files:** Modify `backend/marketplaces/temu/sections/after-sales.js`. Test: `backend/marketplaces/temu/test/sections-after-sales.test.js`.

**Interfaces:** `details.aftersales` gains the return order (`bg.aftersales.parentreturnorder.get`), return address (`temu.aftersales.returnaddress.get`), and proof of delivery signature (`temu.aftersales.signature.get`); `actions['return-label']`: carriers from `temu.aftersales.carrier.get`, prepare via `temu.aftersales.returnlabel.prepare.get`, upload the seller's own label `{file, carrier, trackingNumber}` via `temu.aftersales.upload.returnlabel`.

- [ ] **Step 1: Failing tests:** `a return shows its return order, address and signature`; `the seller's return label is uploaded with its carrier and tracking`; `a label for a closed return is refused`.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu returns: return labels and return shipping`.

### Task 9: Run ads

**Files:** Modify `backend/marketplaces/temu/sections/ads.js`. Test: `backend/marketplaces/temu/test/sections-ads.test.js`.

**Interfaces:** table action `create-ad`: eligible goods (`temu.searchrec.ad.goods.create.query`) with Temu's ROAS prediction per goods and target (`temu.searchrec.ad.roas.pred`) → `temu.searchrec.ad.create` (per goods, refusals per goods); row actions `edit-ad` (`temu.searchrec.ad.modify`: budget, target ROAS, on/off) and details `ad` (`temu.searchrec.ad.detail.query` + change log `temu.searchrec.ad.log.query`).

- [ ] **Step 1: Failing tests:** `eligible goods come with Temu's predicted ROAS`; `creating ads for three goods reports the one Temu refuses`; `an ad's budget and target ROAS can be changed`; `an ad's change log is listed newest first`.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu ads: create, edit and follow ads`.

### Task 10: Promotions and price leftovers

**Files:** Modify `backend/marketplaces/temu/sections/promotions.js`, `sections/price-reviews.js`. Tests: their test files.

**Interfaces:** `actions['edit-enrolled']` on an enrolled goods row: quantity / activity price → `bg.promotion.activity.goods.update` (activity price passed as Temu sends it, as in wave 1); Price guide gains Temu's base price suggestion (`temu.local.goods.baseprice.recommend`) per goods. Newer list calls `temu.local.goods.list.retrieve` / `temu.local.sku.list.retrieve` replace `bg.local.goods.list.query` in the price guide when granted (fallback to the old call).

- [ ] **Step 1: Failing tests:** `an enrolled goods' quantity can be changed`; `the price guide shows Temu's base price suggestion`; `the newer SKU list is used when granted, the old one otherwise`.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu promotions and prices: edit enrolments, base price suggestion`.

### Task 11: Temu analytics

**Files:** Modify Temu `frontend/src/marketplaces/temu/sections/analytics/AnalyticsPage.jsx`; Create `backend/marketplaces/temu/sections/analytics.js` (+ register `analytics` in `sections/index.js`). Test: `backend/marketplaces/temu/test/sections-analytics.test.js`.

**Interfaces:** Temu's API has no traffic or conversion reports; analytics come from Temu data the dashboard already reads. Loader tabs (after the page's own sales charts, kept as `ownTabs`): **Ads** (daily spend, sales and ROAS for 30 days from `temu.searchrec.ad.reports.mall.query`), **Order health** (cancellation rate, return rate, late shipment count over 30 days from orders + after-sales lists), **Store** (store tags from `temu.local.mall.tags.get`).

- [ ] **Step 1: Failing tests:** `ads by day show spend, sales and ROAS`; `order health rates come from 30 days of orders and returns`; `store tags are listed`; `the page's own sales charts stay when Temu's API is unavailable`.
- [ ] **Steps 2–4.**  **Step 5: Commit** `Temu analytics: ads by day, order health, store tags`.

### Task 12: Coverage pin and docs

- [ ] **Step 1:** Test `Temu wave 3 methods are covered` listing every method named in Tasks 1–11 (status `covered`).
- [ ] **Step 2: Run** `npm run -s api-coverage && node --test test/api-coverage.test.js` — Expected: PASS.
- [ ] **Step 3:** README (Temu part): listing flow, helper routes, labels, uploads not stored.
- [ ] **Step 4:** Both suites + build green.  **Step 5: Commit** `Temu wave 3: coverage and docs`.

---

## Decided here (you may change these at review)

- **Listing uses `bg.local.goods.add`**, the method Temu's release guide documents; `temu.local.goods.v2/v3.add` stay unused until Temu documents what they change.
- **New goods start as "Under review"**: Temu reviews them before they go on sale; the next sync shows the outcome.
- **Not in this wave:** fulfilment by Temu's partner warehouses (`bg.cooperativewarehouse.*`, needs that programme), real-shot photo upload (`bg.flash.open.upload.*`), product videos and manuals (`bg.local.goods.gallery.signature.get`) — they can follow the photo upload once listing works.
- **Analytics** stay on Temu data the dashboard can read (Temu offers no traffic report API).
