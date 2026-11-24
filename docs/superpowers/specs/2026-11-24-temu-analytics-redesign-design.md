# Temu Analytics redesign — design

**Status:** approved by the user (2026-11-24). First of a series: each Temu section is redesigned on its own; Temu need not match eBay or TikTok.

## Intent
One Temu-only page that answers, in this order: *is anything wrong with my Temu shop?* then *how is it selling?* The user handed the layout to me; the order "health first, results second" is my call, approved.

## What Temu offers (constraint)
Temu US gives no views, visitors or conversion data. The page is built only from: the dashboard's synced Temu orders (revenue, orders, profit, by day, top goods), stock, Temu's traffic warnings per goods (`temu.local.goods.list.retrieve`), store tags (`temu.local.mall.tags.get`), returns and cancellations counts, and ad reports (only once Temu Ads is on).

## Layout (top to bottom, one page, no tabs)
1. **Header:** "Temu analytics", period select (7 / 30 / 60 / 90 days).
2. **Needs attention:** one line per problem that exists now, each linking to its page — traffic-restricted / low-traffic goods → Goods; low and out-of-stock → Inventory; returns per 100 orders → Returns & refunds. Nothing wrong → "All good".
3. **Result tiles:** Revenue, Orders, Avg order, Profit (with margin %), Returns per 100 orders. The first four show the change vs the previous period of the same length.
4. **Revenue & orders by day**, with the previous period as a dotted line.
5. **Top goods** (units, revenue, ⚠ badge when Temu restricts or limits its traffic) beside **Store health** (store tags, cancellations per 100 orders).
6. **Ads** (spend, ROAS, share of sales): only when Temu returns ad data; otherwise not shown.

Removed: the "by marketplace" chart and the Sales / Temu insights tabs.

## Approaches
- **Chosen — redesign the page on the existing data.** Results from `/api/temu/analytics/{summary,revenue,products,inventory}` (summary and revenue fetched again for the previous period); health from the Temu insights loader (`/api/temu/sections/analytics`). Least work; no new data source.
- Not chosen — one combined overview endpoint. Faster single request, but backend work the page doesn't need yet; revisit only if the page feels slow.

## Calls I made (correct me)
- `/api/temu/analytics/products` also returns each product's Temu goods IDs (from its Temu listings) so the traffic badge can match Temu's warnings. Small backend change.
- Top goods shows no per-goods profit: the dashboard doesn't record profit per item.
- Returns and cancellations per 100 orders, store tags and ads cover Temu's fixed recent window (the insights loader's own period), labelled as such; they don't follow the period select and show no change arrow.
- The page shows a loading state per block, and a block whose data failed shows its own error with Retry; the rest of the page still renders.

## Non-goals
Other Temu sections (next in the series); other shops; new Temu API calls.
