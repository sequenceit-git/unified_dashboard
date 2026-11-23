# Per-shop backend — design

Decided 2026-11-24 (grilling round after the per-shop frontend and per-shop API).

## Goal

Each shop's backend logic lives only in that shop's folder (`backend/marketplaces/<key>/`), the
same way its frontend pages do. A fix to one shop never touches another shop's code.

## Decisions

1. **Route handlers and services per shop.** Each shop gets its own copy of the order, product,
   inventory, customer, inbox, analytics and section logic (routes, services, tests), trimmed to
   that shop. The shared `backend/routes/shop/` and the shop parts of `backend/services/` are
   removed. Accepted cost: a fix to common behaviour needs one edit per shop.
2. **Sync per shop.** Each shop has its own sync jobs (orders, listings, inbox, access, full).
   The scheduler (`services/core/syncQueue.js`: Redis lock, intervals) stays one small piece of
   infrastructure that starts each shop's own job.
3. **One database.** Collections and field names stay as they are; rows are separated by
   `marketplace` / `shopId`. Each shop's code only queries its own rows (enforced by a test).
4. **UI building blocks stay shared** (frontend `components/`, layout, API client, auth, hooks).
5. **Cross-shop pages stay shared**: login, sub-admins, Overview, Market research, Settings, and
   the backend behind them (auth/users, dashboard overview, research, settings, shop list /
   OAuth / profiles / connect / manual sync triggers).
6. **Delivery:** this plan is reviewed first; then eBay, TikTok Shop, Temu one after the other,
   tested and pushed after each shop.

## Consequence the plan must handle

A product (one `Product` document) can be listed on several shops. Today a sale on one shop
lowers the product's stock and pushes it to the product's listings on the other shops
(`propagateStock`), and a product edit pushes title/price/stock to every listing
(`pushProductChanges`). That fan-out is cross-shop by nature, so a small shared coordinator stays:
it finds the product's listings and asks **each listing's own shop** to push the change. All
shop logic (how to push, what to send) lives in the shop folders.

## Unchanged

API URLs (`/api/<shop>/…`), request/response JSON, database collections and fields, sync
intervals and env flags, notifications, cached-response groups.
