# Per-shop products, stock and price — design

Decided 2026-11-24, after the per-shop backend. The shops list different fields through different
APIs, and stock is kept separately per shop, so a product's data must not be shared across shops.

## Decisions

1. **One product per shop.** Every `Product` belongs to exactly one shop (new field
   `marketplace`, one of the registry keys). A product listed on two shops becomes two products,
   each with its own title, price, stock, variants and listing fields. A sale or edit on one shop
   never changes another shop's product. The cross-shop stock/price fan-out
   (`services/catalog/fanOut.js`) is removed.
2. **Migration numbers.** Each shop's copy takes stock and price from that shop's own listing (what
   the marketplace shows). Unlisted products go to `attributes.targetMarketplace`; products with no
   shop at all are copied to every shop.
3. **SKU unique per shop.** The unique index becomes `{ marketplace, sku }` (was `{ sku }`); the
   migration drops `sku_1` and builds the new index.
4. **History follows the shop.** Each shop's listings, order items, inventory history and Market
   research "added product" links point to that shop's copy.
5. **Migration safety.** The script never runs on production by itself: the user runs it inside the
   container. It writes a JSON backup of the touched collections first, prints the plan by default,
   writes only with `--apply`, and is safe to run twice. Code and migration deploy together with
   all sync paused (`SYNC_PAUSED=true`).
6. **Delivery:** reviewed plan, native execution, one fresh reviewer at the end.

## Unchanged

API URLs and response shapes (a product gains a `marketplace` field), each shop's pages, the
Overview (it sums per shop), notifications, sync intervals.

## Deploy runbook

1. In the server's `.env` set `SYNC_PAUSED=true`. This stops every sync, including the ones
   marketplace webhooks trigger (the `*_AUTO_SYNC` flags alone don't stop those). Webhooks are
   still answered; the regular sync catches up afterwards.
2. `git pull && docker compose up -d --build backend frontend`
3. Dry run, read the summary: `docker compose exec backend npm run split-products`
4. Apply: `docker compose exec backend npm run split-products -- --apply`
5. Copy the backup out right away (the script prints the exact command), e.g.
   `docker cp unified-dashboard-backend:/app/backups/split-products-<time> ./`
6. Rename stored section ids to the shops' own names (sub-admin permissions, shop access keys):
   `docker compose exec backend npm run rename-sections` (dry run), then with `-- --apply`, and
   copy its backup out the same way.
   Sub-admin permissions are cached for a few minutes; step 8 restarts the backend, which picks
   up the renamed permissions at once.
7. Run the split dry run again: it must report 0 products, 0 copies and 0 listings attached to another
   shop's product. If `--apply` stopped midway (connection drop), just run it again: it reuses the
   copies already made and finishes.
8. Remove `SYNC_PAUSED=true` and `docker compose up -d backend`.

Between steps 2 and 4 product pages show no products (they have no shop yet), so run the
migration right after the deploy.
