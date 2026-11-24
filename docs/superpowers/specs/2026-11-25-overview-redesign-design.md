# Overview panel redesign

**Status:** draft for the user's approval (2026-11-25).

**What it is today:** the home page (`frontend/src/pages/dashboard/Overview.jsx`, sidebar "Overview", route `/`). It shows:
- a fixed "Good morning" heading;
- a large Product Discovery banner;
- 8 number cards: shops connected, revenue 30 days, orders 30 days, buyers, ready to ship, live listings, open messages, low stock.

The data comes from `GET /api/dashboard/overview` (`backend/routes/system/dashboard.js`), cached for 30 s and limited to a sub-admin's shops.

**What's wrong with it:** it shows totals but not what to do next:
- no comparison with before, no trend;
- no per-shop view;
- nothing links to the work.

**Goal:** open the dashboard and know within a few seconds:
1. what needs doing today, across every shop;
2. how sales are going, compared with before;
3. how each shop is doing.

Each of those is one click from its page.

**Rules**
- **Shared page, no shop names in the code.** Shops come from the shop registry (`getShop`, `KEYS`) and from the shop's own name. The hard-coded "eBay, TikTok Shop, and Temu" text and "/ 3" go away. `no-shop-branches` must still pass.
- **Nothing removed.** All 8 numbers stay, just placed better. The Product Discovery link stays.
- **Same data.** Only orders, listings, products, customers, conversations, shops and sync logs already in the database. No shop API calls on this page.
- **Sub-admins** see only their shops, everywhere on the page, as today.
- **Same look as the redesigned shop pages:** header with summary, Needs attention, cards, links into pages. Works on phones and in dark mode.

---

## Layout

```
Good afternoon · Tue 25 Nov                          updated 14:02 [Refresh]
$12,480 last 30 days (+8% vs previous 30) · 342 orders · 3 of 3 shops connected

┌ Needs attention ─────────────────────────────────────────────────────────┐
│ ⚠ 9 orders to ship (2 past ship-by) → Orders   ⚠ 4 messages waiting → Inbox │
│ ⚠ 3 out of stock · 5 low → Inventory   ⚠ TikTok Shop login expired → Settings │
│ ⚠ 2 syncs failed today → Sync log                                          │
└──────────────────────────────────────────────────────────────────────────┘

[ Revenue $12,480 +8% ] [ Orders 342 +3% ] [ Avg order $36.49 ] [ Buyers 1,204 · 61 new ]

Sales, last 30 days                         [ Revenue | Orders ]
▁▂▃▅▄▆▇▅▆▇█▆  (one line per shop, total on hover)

Your shops
┌ eBay ● connected ──┐ ┌ TikTok Shop ● expired ┐ ┌ Temu ● connected ──┐
│ $6,200 · 170 orders│ │ $3,900 · 112 orders   │ │ $2,380 · 60 orders │
│ 4 to ship · 210 live│ │ Reconnect →          │ │ 5 to ship · 88 live│
│ synced 5 min ago   │ │ synced 2 days ago     │ │ synced 12 min ago  │
│ Orders · Analytics │ │                       │ │ Orders · Analytics │
└────────────────────┘ └───────────────────────┘ └────────────────────┘

To ship next (oldest first)              Top products, last 30 days
#1234 · Temu · ship by today   [Open]    Phone case · $1,240 · 62 sold
#5678 · eBay · paid 2 days ago [Open]    Mug · $980 · 40 sold
…5 rows · All orders →                   …5 rows

Live listings 386 · Open messages 4 · Low stock 5        ✦ Product Discovery →
```

## Parts

1. **Header**
   - A greeting by local time (morning, afternoon or evening) and the date.
   - The summary line: revenue with its change, orders, and shops connected out of the shops in the registry.
   - Updated time and **Refresh**, which loads fresh data past the 30 s cache.
2. **Needs attention.** Only items that have a count. Each one links to its page. A check that failed says so; it never shows "All good".
   - Orders to ship, and how many are past their ship-by date (`shipping.shipBy`, filled where the shop gives it).
   - Inbox threads still waiting.
   - Out of stock and low stock goods.
   - Shops whose login stopped working (`status: 'error'`, `authError`) or is about to expire (`auth.expiresAt` within 3 days).
   - Syncs that failed in the last 24 hours (`SyncLog` with status `failed`).
3. **Number cards** (4 instead of 8):
   - revenue, compared with the previous 30 days;
   - orders, compared with the previous 30 days;
   - average order value;
   - buyers, with how many are new in the last 30 days.

   Ready to ship, open messages and low stock move to Needs attention. Live listings goes to the shop cards and the footer line, and shops connected to the header.
4. **Sales chart.**
   - Daily revenue or orders for 30 days, one line per shop, using recharts (already used by the shop Analytics pages).
   - Shop colours come from the registry, or else a fixed palette.
5. **Your shops.** One card per shop in the registry that the user can see:
   - status, and the revenue and orders for 30 days;
   - to ship, live listings and last sync;
   - links to the shop's Orders and Analytics;
   - a disconnected shop or broken login shows **Connect / Reconnect** linking to Settings.
6. **To ship next.**
   - The 5 oldest orders waiting to ship: ship-by first, then paid date.
   - Each shows its shop and opens on that shop's Orders page (`?q=` order id).
7. **Top products.** The top 5 by revenue in 30 days, from order lines, across shops.
8. **Footer.**
   - Live listings, open messages and low stock as small links, so all 8 old numbers stay on the page.
   - Product Discovery as a small card instead of the big banner.

## Server

`GET /api/dashboard/overview` keeps every field it returns today and adds:
- **`previous`:** `{ revenue, orders }` for days 31–60 back.
- **`avgOrder`, `newBuyers30`.**
- **`daily`:** `[{ date, shops: { <shopKey>: { revenue, orders } } }]` for 30 days, as one aggregation grouped by day and marketplace.
- **`byShop`:** `[{ shopId, marketplace, name, status, authError, expiresAt, lastSyncAt, revenue, orders, toShip, live }]`.
- **`attention`:** `{ toShip, late, openInbox, outOfStock, lowStock, loginProblems: [...shops], syncFailed24h }`.
- **`toShipNext`:** the 5 orders, with only the fields the list needs.
- **`topProducts`:** 5 rows `{ productId, title, revenue, units }`.
- **`?refresh=1`:** skips the cache.

The same sub-admin scoping applies to every new part. Each part fails on its own: its error is reported next to it and the rest still shows.

## Order of work

| # | Step | Size |
|---|---|---|
| 1 | Server: new fields with tests (scoping, failures per part) | medium |
| 2 | Page: header, Needs attention, number cards, footer (testable view module) | small |
| 3 | Sales chart and Your shops cards | medium |
| 4 | To ship next and Top products | small |

Each step: build, then independent review, then fixes, then push.

## Not in this plan
- Changing the shop pages.
- New shop API calls.
- Goals or targets.
- Choosing the date range (fixed at 30 days for now).
