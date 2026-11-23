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
   automatic sync paused (`ORDER_AUTO_SYNC=false LISTING_AUTO_SYNC=false INBOX_AUTO_SYNC=false`).
6. **Delivery:** reviewed plan, native execution, one fresh reviewer at the end.

## Unchanged

API URLs and response shapes (a product gains a `marketplace` field), each shop's pages, the
Overview (it sums per shop), notifications, sync intervals.
