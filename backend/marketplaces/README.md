# Marketplaces (backend)

Everything specific to one shop lives in its folder. The shared core (`services/marketplace/`,
`services/<domain>/`, `routes/`) talks to shops only through the registry and never checks for
`'ebay'`, `'tiktok_shop'` or `'temu'` by name (`test/no-shop-branches.test.js` enforces this).

```
marketplaces/
  index.js       registry: KEYS, get(key), all(), labels(), urlId(key), canonical(value), listingUrl(...), assertAdapters()
  contract.js    the adapter contract (REQUIRED / OPTIONAL members, checkAdapter)
  <key>/         ebay | tiktok_shop | temu  (same as Shop.marketplace in the database)
    index.js     the adapter: what the shared core may use
    config.js    settings from the environment (env var names unchanged)
    client.js    signing, auth, the raw API call
    orders.js    orders, shipping, cancel, refunds, returns        (mixed into service.js)
    listings.js  listings, stock, price, categories                 (mixed into service.js)
    service.js   one object with every API method the core calls (getOrders, updateStock, ...)
    webhooks.js  push notifications: handle / enable
    hooks.js     shop-specific steps inside the shared sync (optional)
    routes.js    the shop's public endpoints under /api (webhooks), mounted by routes/system/api.js
    app/         the shop's dashboard logic: api.js, routes/, services/, manager.js (sync), test/
    profile.js   sidebar sections (+ read-only access probes), statuses, product form rules
    sections/    one file per sidebar section; each returns { summary, tables } for its subsections
    scripts/     smoke tests and read-only checks (npm run smoke:<shop>, check:ebay-listings)
    test/        node --test, APIs stubbed
```

## Adapter contract

Required (checked at server start by `assertAdapters()`): `key`, `label`, `config`, `service`,
`profile`, `sections`.

Optional, read by the core only when present:
- `webhooks` — `{ handle, enable }`; `enable(shop)` turns live updates on (daily `live` job).
- `hooks` — `fetchOrders`, `fetchListings`, `listingImages`, `listingVariants`,
  `shippingLineItems`, `orderAppToken`, `orderItemImages`, `promotionTargets`,
  `autoConnectFromEnv`, and `analytics` ({ salesIntervals, productPerformance }: the shop's own
  figures for Analytics, used instead of order totals when only that shop is selected).
  Each replaces the default step for that shop.
- `capabilities` — flags: `inbox`, `inboxNeedsAccountUsername`, `refreshToken`,
  `tracksOrdersSyncedAt`, `syncsVariants`, `relistOnRestock`, `productKeyListings`,
  `listingFetchLimit` (number), `listingNoun` (string).
- `listingUrl(id, saved, { status })` — the listing's public (or Seller Center) page.
- `routes(router)` — mounts the shop's public endpoints (webhooks; eBay account deletion).
- `app` — everything the shop does in the dashboard, in `app/` (loaded on first use):
  `api` (its routes, mounted at `/api/<urlId>`), `sync` (`orders`, `listings`, `access`, `full`,
  `inbox` when it has one — the scheduler runs these), and `catalog` (`publish`, `listingAction`,
  `capabilities`, `remember`, used by Market research). `app/routes/`,
  `app/services/` and `app/manager.js` are this shop's own copies of the order, product,
  inventory, customer, analytics, section, inbox and sync logic; `app/test/` holds its tests.
  `middleware/shopScope.js` pins every request to the shop.
- `skuPrefix` — prefix of new SKUs for this shop (`EBAY`, `TTS`, `TEMU`; `EP` when none).
- `configStatus(config)` — what `GET /api/shops/configs` reports: `{ configured, environment, ... }`.
- `aiHint` — extra instruction for the AI when it drafts a listing for this shop from a URL.
- `importer` — `{ matches(url), readItem(url), source }`: read the shop's own item pages through
  its API instead of scraping (eBay's Browse API).
- `buyer.fallbackEmail(username)` — relay address when a buyer has no email (eBay).
- `hooks.publishedSku(product, publishRes)` — new SKU once a listing exists (eBay: `EBAY-<item ID>`).

Shared code (services, routes, models, middleware, utils, config) must not name a shop;
`test/no-shop-branches.test.js` fails on any shop-name string or shop-keyed map there.

## Add a section to a shop

1. `marketplaces/<key>/sections/<id>.js` exporting `async function <id>(token, shop)` that
   returns `{ summary: [...], tables: [{ id, title, columns, rows }] }` (helpers in
   `services/marketplace/sectionKit.js`).
2. Register it in `marketplaces/<key>/sections/index.js`.
3. Add `{ id, label, path: '/shop/<id>', route, needs, probe }` to `marketplaces/<key>/profile.js`.
4. Frontend: add the subsection to `frontend/src/marketplaces/<key>/index.js`, and a
   `sections/<id>.jsx` if its tables have action buttons.

### Tabs, row actions and scopes (eBay)

- A table or summary tile may carry `tab: '<name>'`; the shop's `SectionView`
  (`frontend/src/marketplaces/ebay/SectionView.jsx`) shows one tab per name, in loader order.
  Tiles without a tab show on every tab. A page can keep its own content as the first tab
  (`extraTabs`: eBay Analytics "Sales", Buyers "Buyers").
- A row may carry `actions: [{ id, label, confirm?, input? }]`; the page posts
  `POST /api/ebay/sections/<section>/<action>` with `{ id: row.id, value }`. eBay routes:
  `returns-cases/:actionId` (mark-received, refund, inquiry-refund, inquiry-tracking,
  dispute-accept), `buyers/reply`, `offers/:actionId` (offer-accept, offer-decline,
  offer-counter). Each service also checks the section, not only the route guard.
- Write each API path out in full at the call (no shared base variable): the API coverage
  report (`npm run api-coverage`) finds endpoints by their path.
- eBay asks for three scopes beyond the original six (`config.extraScopes`: analytics, payment
  disputes, feedback; `sell.finances.earnings.read` is left out because eBay refuses it for this
  app, so Order earnings are worked out from transactions). `EBAY_EXTRA_SCOPES` replaces the
  list; `""` asks for none, e.g. if the eBay keyset refuses one. Shops connected before them see
  which features a reconnect turns on (`missingScopes`); tables whose scope is missing say
  "Reconnect eBay in Settings to allow …" (`sections/helpers.js` `scopeAware`).
- Drill-downs and generic actions: a section file may export `details[name](token, shop, id)`
  (read-only `{ title, summary?, tables }`) and `actions[name](token, shop, id, value)`
  (`{ message, refused? }`), served by `GET|POST /api/ebay/sections/:sectionId/:actionId` after
  every named route; only the file's own names run (`Object.hasOwn`), the section access is
  checked before any eBay call, and an action clears the section cache even when it fails.
  Row actions may ask for `input.fields` with `options` + `multiple` (an array) or `type: 'file'`
  (`{ name, type, size, dataUrl }`).
- Promoted Listings (`sections/advertising.js`): campaigns (pause, resume, end, rename,
  budget), ads with eBay's suggested rates (Recommendation API; bulk calls in batches of 500,
  refusals per listing), create/copy campaigns, and ad reports (eBay builds them in the
  background; a finished one is read as gzipped TSV, first 500 rows).
- Returns & cases (`sections/returnsActions.js`): dispute evidence photos (JPEG/PNG checked by
  their bytes, up to 5 MB) are uploaded to eBay as multipart (`client.js` `ebayUpload`) and never
  stored or logged; contest, return messages/photos/label/escalation, inquiry messages and
  escalation, case appeal.
- Who pays shipping: `product.ebayShipping` (`paidBy`, `cost`, `type`, `policy`) is read from the
  listing on sync; listing or editing sends it as `ebayShipping`. Free shipping makes the first
  domestic service free (eBay's rule); the buyer pays a typed cost on a flat listing or eBay's
  rate on a calculated one. A revise sends the whole `ShippingDetails` back (eBay replaces it);
  a listing on an eBay shipping policy is refused with the policy's name.

### Tabs, drill-downs and actions (TikTok Shop)

TikTok's own section view (`frontend/src/marketplaces/tiktok_shop/SectionView.jsx`; nothing is
shared with another shop's pages):
- Tables and tiles carry `tab`; a tile whose tab has no table shows on the first tab.
- A section file may export `details[name](token, shop, id) → { title, summary?, tables }`
  (read-only drill-downs, row action `{ id, label, detail: true }`) and
  `actions[name](token, shop, id, value) → { message }` (row or table `actions`). Both are served
  by `GET|POST /api/tiktok/sections/:sectionId/:actionId`, after the section's access check.
  Used by: analytics (`sku`, `metric`), videos-live (`video`, `live`), finance (`statement`,
  `order`), packages (`package`, action `ship-all`), returns-cancellations (`records`, action
  `reject` with TikTok's reasons for that return).
- `sections/helpers.js` `scopeAware(load, scope)`: a TikTok permission error reads "Your TikTok
  app doesn't have the <scope> scope …"; token errors (401) pass through unchanged.
- Also: `GET /api/tiktok/orders/:id/price-detail`, `GET /api/tiktok/inventory/tiktok-stock`,
  `GET /api/tiktok/products/seo-words`, `POST /api/tiktok/products/:id/listing-check` (the same
  body as `/list`, sent to TikTok's listing check; nothing is published).

### Tabs, drill-downs, actions and granted methods (Temu)

Temu's own section view (`frontend/src/marketplaces/temu/SectionView.jsx`, orange pill tabs; no
other shop's pages or components):
- Tables and tiles carry `tab`; `ownTabs` (a page's own content) stay when Temu's API for the
  section isn't available.
- A section file may export `details[name](token, shop, id)` and `actions[name](token, shop, id,
  value)`, served by `GET|POST /api/temu/sections/:sectionId/:actionId` after the section's
  access check; only the file's own names run (`Object.hasOwn`). Used by: after-sales
  (`aftersales`), promotions (`enrolled`, action `enrol`).
- Granted methods: `shop.grantedScopes` = the token's `apiScopeList` (stored at connect;
  `POST /api/temu/shops/:id/refresh-permissions` reads it again). `sections/helpers.js`
  `grantAware(shop, method, load)` says how to enable a method that isn't granted; a shop without
  a stored list is never blocked.
- Also: `GET /api/temu/goods/:goodsId/temu-detail`, `POST /api/temu/goods/:goodsId/sku-codes`,
  `GET /api/temu/orders/:id/temu-detail`, `POST /api/temu/orders/:id/full-address` (on request,
  `Cache-Control: no-store`, never stored), `GET /api/temu/inventory/temu-stock`.

### Temu US: listing, compliance, labels, returns, ads (wave 3)

The shop is Temu US (openapi-b-us, regionId 211, USD; weights in lb, sizes in inches, one decimal).
- Listing (Temu's release flow): helpers under `/api/temu/goods/helpers/*` (categories, recommend,
  template, spec, images by public URL → Temu url, shipping templates, brands, tax codes, net units,
  price suggestion, banned-word/duplicate-code check); `goodsTemplate.js` maps Temu's template,
  `goodsPayload.js` builds `bg.local.goods.add` (problems by field → 400); `listings.createListing`
  reads the template again, runs Temu's property check, adds the goods ("Under review"). Edits use
  `bg.local.goods.partial.update` (+ attributes.edit); deleting a product deletes the Temu goods first.
- Compliance (US): `/api/temu/goods/compliance`, `/goods/:goodsId/compliance`, certificate upload
  (PDF/JPEG/PNG ≤ 10 MB by bytes, Temu file upload, never stored). EU GPSR/representative editing is
  not built.
- Orders: `/orders/:id/temu-follow-up` (packages + tracking, customisation, out-of-stock cancellation
  result), `/orders/temu-ship-together`, `/orders/:id/verification`.
- Buy-shipping (`app/services/labels.js`): services → `shipment.create` (sendType 0, ship now) →
  "bought" only when `shipment.result.get` says so; the label file is fetched with Temu's toa-*
  signed headers and handed over (`GET /orders/:id/label`, never stored); retry, own carrier, pickups.
- Returns: return shipment in the detail, buyer's return address on request (never stored), upload
  your own return label. Ads: create (eligibility first, budget in USD, ROAS typed or Temu's
  prediction), change budget/ROAS, details and change log. Analytics: Temu insights tab.
- Not built because Temu doesn't document the values: pre-sale on/off, seller cancellation request,
  promotion enrolment edits (operateType), ad pause (status), split shipments.

## Add a shop

1. Create `marketplaces/<new_key>/` with the files above and an `index.js` adapter.
2. Add the key to `KEYS` in `marketplaces/index.js` and its config to `config/marketplaces.js`.
3. Frontend: `frontend/src/marketplaces/<new_key>/index.js` and one line in its registry.
4. `npm test` must pass (the contract and the no-shop-names checks run there).

## What stays shared

Only infrastructure: models, middleware, utils, config, `services/core/*` (scheduler, cache,
events, notifications), `services/marketplace/connection.js` (OAuth, tokens, access checks,
profiles), and the cross-shop screens: auth/users, overview,
market research, settings. `test/no-shop-branches.test.js` fails if shop logic returns there or
one shop's folder requires another's.

## Products are per shop

Every product belongs to one shop (`Product.marketplace`); a SKU is unique within a shop. A shop's
app only reads, creates, matches and updates its own products, and pushes stock, price and edits
only to its own listings — a sale or edit on one shop never changes another shop. Existing data is
split by `npm run split-products` (see `docs/superpowers/specs/2026-11-24-per-shop-stock-design.md`).

## Section names

Section ids follow each shop's own API (see `profile.js`): they name the section loader files,
the API paths (`/api/ebay/listings`, `/api/temu/sections/after-sales`), permission checks and the
stored ids (sub-admin `allowedSections` as `<key>:<id>`, `Shop.apiAccess` keys). `renamedSections`
on the adapter maps the older generic ids; `npm run rename-sections` renames stored ids.
Main-route permissions (`config/access.js`) are app-wide and keep their names.
