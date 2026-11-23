# Services (backend)

- `core/` — infrastructure shared by everything: `cache`, `redis`, `syncQueue` (BullMQ jobs, run
  inside the API process), `events` (live updates to browsers), `notify`.
- `marketplace/` — the shared sync core: `index.js` (the marketplace manager: order, listing and
  stock sync across shops), `profiles.js` / `sections.js` (built from the shop registry),
  `sectionKit.js`, `listingKeys.js`. No shop names in here; shop code is in `../marketplaces/`.
- `<domain>/` — business logic behind the routes: `catalog/` (products, inventory, import,
  Excel export), `sales/` (orders, customers, customer stats), `research/` (discovery reports),
  `inbox/` (AI auto-reply), `auth/` (users and sub-admins), `analytics/`, `system/` (shops,
  AI settings).
- `productAccess.js` — which products a sub-admin may see or change.

## Routes stay thin

A route parses the request, calls one service function with `ctxOf(req)` and sends the result:

```js
router.get('/', async (req, res) => {
  try {
    res.json(await service.list(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})
```

`ctx` carries `user`, `authUser`, `allowedShopIds`, `shopMarkets`, `ip`, `query`, `body` and
`params` (see `utils/httpError.js`). Services throw `new HttpError(status, { error })` for any
answer that isn't a plain success; the route sends that status and body unchanged.
