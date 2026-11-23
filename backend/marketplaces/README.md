# Marketplaces (backend)

Everything specific to one shop lives in its folder. The shared core (`services/marketplace/`,
`services/<domain>/`, `routes/`) talks to shops only through the registry and never checks for
`'ebay'`, `'tiktok_shop'` or `'temu'` by name (`test/no-shop-branches.test.js` enforces this).

```
marketplaces/
  index.js       registry: KEYS, get(key), all(), labels(), canonical(value), listingUrl(...), assertAdapters()
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
    profile.js   sidebar sections (+ read-only access probes), statuses, product form rules
    sections/    one file per sidebar section; each returns { summary, tables } for its subsections
    scripts/     smoke tests and one-off fixes (npm run smoke:<shop>, cleanup:<shop>)
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
