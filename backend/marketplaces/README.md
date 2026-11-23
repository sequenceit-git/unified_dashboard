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
