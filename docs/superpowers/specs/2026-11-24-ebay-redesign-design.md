# eBay shop redesign — full plan

**Status:** draft for the user's approval (2026-11-24). Analytics is already redesigned (`2026-11-24-ebay-analytics-redesign-design.md`); this plan covers every other eBay section, including its popups, drawers, tabs and forms, and the Direct listing (AI) popup.

**How it is applied:** one section at a time in the order below. For each: I build it from this plan → independent review → fixes → you check it on the server → next section. A section's sketch here is the agreed target; anything I learn while building that changes it, I bring back to you first.

**Rules for all of it:** eBay code only under `frontend/src/marketplaces/ebay` (and `backend/marketplaces/ebay` when a section needs data); shared `components/ui` may be used, nothing from the Temu or TikTok folders. No eBay feature is removed; every action that works today still exists after the redesign (moved, not dropped).

---

## 0. The eBay look (applies to every section)

| Piece | Rule |
|---|---|
| **Header** | Title, one-line summary with counts ("212 listings · 180 live · 6 need attention"), main actions on the right. |
| **Needs attention** | A strip at the top only when something is wrong; each line links to the fix. Never says "All good" when a check failed. |
| **Status pills** | The main filter is a row of pills with counts (e.g. All · Live · Not listed …). Rarer filters sit under **More filters**. Search is always visible. |
| **Tables** | One clear main button per row for what to do next, plus a **⋯** menu for the rest. Money, dates and statuses look the same everywhere. Empty states say what to do. |
| **Drawer** | Looking at one thing (order, buyer, return, conversation, payout): opens from the right, keeps the list visible. Actions for that thing live at the bottom of the drawer. |
| **Popup** | Short actions only: confirm, adjust stock, send an offer, add tracking, a reason. |
| **Large panel with steps** | Long forms (product, list on eBay, direct listing, new promotion, new campaign): full-height panel, steps on the left (or top on phones), Back/Next, Save draft, errors shown next to the field and listed on the last step. |
| **Errors** | eBay's message shown in plain words next to what failed, with Retry when retrying can help and the fix when it can't (e.g. "Reconnect eBay in Settings"). |
| **Loading** | Each block loads on its own; old numbers are never shown as new ones. |

Built once as eBay components in `frontend/src/marketplaces/ebay/ui/`: `PageHeader`, `AttentionStrip`, `StatusPills`, `FilterBar`, `RowActions` (main button + ⋯), `Drawer`, `StepPanel`, `FieldError`.

---

## 1. Listings — part A: the list page

```
eBay listings   212 listings · 180 live · 6 need attention   [✨ Direct listing] [+ New product]
┌ Needs attention: ⚠ 2 failed to list → Fix · ⚠ 3 live but out of stock → Restock ┐
[ All ] [ Live ] [ Not listed ] [ Out of stock ] [ Ended ] [ Problems ]
🔍 Search title, SKU or item number            More filters ▾ (source, category, stock)
[img] Title / SKU · Item ↗ | Price | Stock | ● Status | 👁 views (30d) · badge | [main] ⋯
```
- Row main button by state: Live → **Edit**; Out of stock → **Restock** (stock popup); Not listed → **List on eBay**; Failed → **Fix** (shows eBay's error, opens the form at the failing field); Ended → **Relist**.
- ⋯: duplicate, end listing, view on eBay, delete (with today's safety rules).
- Live listings show 30-day page views and "Seen, rarely clicked" (same traffic data as Analytics).
- A waiting Direct listing draft shows as a banner, as today.
- Needs data: counts per status (backend count by listing status), views per listing (eBay traffic report by listing, cached).

## 2. Listings — part B: forms and Direct listing (AI)

**New / Edit product** (today: one long modal with sections) → large panel with steps:
1. **Photos** (drag & drop, order, main photo)
2. **Basics**: title (with eBay's 80-character counter), subtitle, condition + condition description, brand, MPN / identifiers
3. **Category & item specifics**: category picker with eBay's suggestions, required specifics first, the rest folded
4. **Variations** (only when used): variant editor
5. **Price & stock**: price, base price (cost) with margin shown, stock, low-stock alert, Best Offer settings
6. **Shipping**: who pays shipping (buyer / free / same as other listings), handling time, package size & weight
7. **Review**: everything on one page, problems listed with links back to their step; Save / Save & list.

**List on eBay** (today: ListModal) → the same panel opened at the steps eBay still needs, prefilled from the product; final step "List on eBay" shows eBay's fee/error answer.

**Direct listing (AI)** (today: DirectListModal) → panel with steps:
1. **Paste a product link** → the AI reads the page (progress shown; can be left and resumed, as today)
2. **Check what the AI found**: photos, title, description, price, each marked "from the page" or "AI suggested", editable
3. **Category & specifics**: eBay's suggested category, specifics prefilled by the AI, missing required ones highlighted
4. **Price & shipping**
5. **Review** → Save draft / List on eBay.

## 3. Orders
```
eBay orders   48 orders · 6 to ship · 1 late   [Sync]
┌ Needs attention: ⚠ 1 past ship-by date · ⚠ 2 cancellation requests ┐
[ To ship ] [ Shipped ] [ Delivered ] [ Cancelled ] [ All ]   🔍 order, buyer, item
Order · Buyer · Items (thumbnails) · Total · Ship by · ● Status · [Add tracking] ⋯
```
- **Order drawer** (replaces today's drawer layout): header (status, ship-by, total), Items, Buyer & address (copy button), Shipping & tracking (add/edit tracking in place), Money (subtotal, shipping, fees, earnings), Returns & refunds, actions at the bottom: Add tracking, Refund, Cancel (each a popup with reason).

## 4. Inventory
```
eBay inventory   212 SKUs · 5 low · 1 out   [Adjust stock]
┌ Needs attention: ⚠ 1 out of stock but live on eBay → Restock ┐
[ All ] [ Low ] [ Out ]   🔍 SKU or title
SKU / title · On hand · Low-stock alert · Last change · [Adjust] ⋯ (history)
```
- Stock / History / Low stock tabs become pills + a **History drawer** per SKU; the **Adjust stock popup** gets + / − / set to, a reason and the new eBay quantity shown before saving.

## 5. Returns & cases
```
Returns & cases   3 need a reply · next deadline in 2 days
[ Returns ] [ Cancellations ] [ Not received ] [ Cases ] [ Payment disputes ]   (pills with counts)
ID · Buyer · Item · Reason · Status · Respond by · [main action] ⋯
```
- Rows sorted by deadline; overdue in red.
- **Details drawer** (replaces the details popup): timeline (history), photos & files, money, and the actions as buttons at the bottom — Accept, Refund, Send return label, Mark received, Message buyer, Add photo, Add tracking, Ask eBay to step in, Contest / Add evidence / Appeal — each opening a short popup with its fields.

## 6. Messages (Unified Inbox)
- Two-pane inbox: conversation list (unread first, buyer, item, last line, time) and the conversation with the item card on top and a reply box at the bottom. Filter pills: Buyer messages · Everything · Unread. On phones the list and the conversation are separate screens.

## 7. Best offers
```
Best offers   4 waiting · 2 expire today
[ Offers from buyers ] [ Send offers to watchers ]
Item · Buyer · Offer vs price (−18%) · Expires · [Accept] [Counter] ⋯ Decline
```
- Counter / send-offer popups show the price, the offer and your margin.

## 8. Promotions
- List: pills Running · Scheduled · Ended; each row with type, discount, listings count, dates and results (sales, sold) inline; ⋯ Listings, Delete.
- **New promotion** → step panel: type → discount → listings → dates → review.

## 9. Promoted Listings (advertising)
- Campaigns list with status pills; each row: budget/ad rate, ads, spend, sales, ROAS; ⋯ Pause/Resume, End, Rename, Copy, Daily budget, Delete.
- **Campaign drawer**: its ads (set ad rate, add/remove listings with eBay's suggested rates), results.
- **New campaign** → step panel: listings → ad rate (eBay suggestion shown) → budget → review. Reports: request + list, download.

## 10. Payouts
```
Payouts   Next payout $412.30 · Funds on hold $58.00 · Last 30 days paid $3,904
[ Payouts ] [ Transactions ] [ Order earnings ] [ eBay bill ]
```
- Tiles on top (available, on hold, paid out 30/90 days), pills for the four lists, **Payout drawer** with its transactions.

## 11. Buyers
- Buyers list: name, orders, spent, last order, feedback left; pills All · Repeat buyers · Waiting for feedback.
- **Buyer drawer**: contact & address (edit), order history, feedback given/received with **Leave feedback** / **Reply**.

---

## Order of work

| # | Section | Size |
|---|---|---|
| 0 | eBay look (shared eBay components) — built with section 1 | small |
| 1 | Listings A: list page | medium |
| 2 | Listings B: product form, List on eBay, Direct listing (AI) | large |
| 3 | Orders + order drawer | medium |
| 4 | Inventory + adjust / history | small |
| 5 | Returns & cases + details drawer and action popups | medium |
| 6 | Messages | medium |
| 7 | Best offers | small |
| 8 | Promotions + new promotion steps | medium |
| 9 | Promoted Listings + campaign drawer and new campaign steps | medium |
| 10 | Payouts + payout drawer | small |
| 11 | Buyers + buyer drawer | small |

## Non-goals
Temu and TikTok sections (later, their own designs); new eBay features beyond what the API already gives the app; changing how data is stored.
