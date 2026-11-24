# Temu shop redesign — remaining sections

**Status:** draft for the user's approval (2026-11-25). Already done: Analytics, Goods (list page, listing form, goods form, Direct listing). This plan covers every other Temu section, with its drawers, popups and forms.

**How it is applied:** one section at a time in the order below. For each: build from this plan → independent review → fixes → you check it on the server → next section. Anything I learn while building that changes a sketch, I bring back first.

**Rules for all of it**
- Temu code only under `frontend/src/marketplaces/temu` and `backend/marketplaces/temu`; Temu's own UI parts in `marketplaces/temu/ui` (PageHeader, AttentionStrip, StatusPills, RowActions, StepPanel, StepProblems — already there). Nothing from the eBay or TikTok folders.
- No Temu feature is removed: every action that works today still exists after the redesign.
- Temu US only (openapi-b-us, region 211, USD, lb / in). Methods the shop's token lacks are skipped quietly (as today); only documented Temu codes drive "needs attention".
- Same look as Goods: header with a counts summary, Needs attention (never "All good" when a check failed), status pills with counts, one main button per row + ⋯, drawer to look at one thing, popup for short actions, step panel for long forms.

---

## 1. Orders (+ order drawer)

```
Temu orders   126 orders · 9 to ship · 2 past ship-by        [Sync]
┌ Needs attention: ⚠ 2 past ship-by date · ⚠ 3 can ship together · ⚠ 1 cancellation request ┐
[ To ship 9 ] [ Label bought 4 ] [ Shipped ] [ Delivered ] [ Cancelled ] [ All ]   🔍 order, buyer, SKU
Order · Buyer · Items (photos) · Total · Ship by · ● Status · [Buy label | Print label | Add tracking] ⋯
```
- Row main button follows the label state already in the app: no label → **Buy label**; label bought → **Print label**; shipping your own way → **Add tracking**.
- ⋯: ship together, follow-up / verification upload, cancel, open on Temu.
- **Order drawer** (today's TemuOrderDetail + TemuLabel + TemuFollowUp, re-laid out): header (status, ship-by, total), Items, Buyer & address (copy), Shipping (label: buy → status → print; pickup: book / cancel; own carrier tracking), Money (Temu's amounts, or the note that Temu US doesn't share them), Follow-up & verification, actions at the bottom.
- Buy label becomes a short **step panel**: package → carrier & service (Temu's offers with prices) → confirm.

## 2. Shipping

```
Temu shipping   9 awaiting shipment · 4 labels today · 1 pickup booked
[ Awaiting shipment ] [ Labels ] [ Carriers & services ] [ Warehouses & templates ]
```
- Today's tabs become pills; tiles on top (awaiting shipment, labels bought today, pickups booked).
- Labels: last 30 days, newest first, each with **Print** and its status; failed labels on top with Temu's reason.
- Carriers & services and Warehouses & templates stay as reference tables.

## 3. Inventory

```
Temu inventory   212 SKUs · 5 low · 1 out              [Adjust stock]
┌ Needs attention: ⚠ 3 SKUs differ on Temu → Use dashboard stock · ⚠ 1 out of stock but on sale ┐
[ All ] [ Low ] [ Out ]   🔍 SKU or title
SKU / title · On hand · Low-stock alert · Temu stock · Last change · [Adjust] ⋯ History
```
- The existing Temu stock check moves into Needs attention (still with **Use dashboard stock**).
- History and Low stock tabs become pills + a **History drawer** per SKU.
- **Adjust stock popup**: set / add / remove, reason, and the new quantity Temu will get, shown before saving.

## 4. Returns & refunds (after-sales)

```
Temu returns & refunds   5 open · 2 need your action
[ Returns 5 ] [ Cancellation requests 1 ] [ Closed ]
Request · Order · Items · Reason · Refund · ● Status · Updated · [Details] ⋯ Upload return label
```
- Open requests first; Temu's own status names.
- **Details drawer** (replaces the popup): lines with reasons and buyer comments, refund summary, return shipment and carrier, history timeline, return address; actions at the bottom (upload return label when the token allows it).

## 5. Price reviews

```
Temu price reviews   2 waiting for you · 14 SKUs priced above Temu's recommendation
┌ Needs attention: ⚠ 2 price reviews waiting for your answer (Temu code 101) ┐
[ Waiting for you ] [ All reviews ] [ Price guide ]
```
- Reviews waiting for you (code 101) first, with Temu's suggested price next to yours.
- **Price guide**: your price vs Temu's recommended price per SKU, difference %, the ones a review is likely to reject first; link to the goods' form.
- If the token allows Temu's accept / decline price calls, those become row buttons; otherwise a note says to answer in Seller Center (no new Temu calls without your OK).

## 6. Promotions

```
Temu promotions   3 joined · 12 open to join
[ Open to join ] [ Joined ] [ Ended ]
```
- Temu's activities as cards: dates, what Temu asks (discount, stock), how many of your goods qualify; **Enrol goods** opens a short step panel (pick goods → price & stock per SKU → confirm).
- Joined: enrolled goods per promotion in a drawer.

## 7. Ads (shown only when Temu Ads is on for the shop)
- Overview tiles: spend, sales from ads, ROAS (last 30 days, vs previous).
- Ads by goods: spend, sales, ROAS, status; row button **Edit** (budget & ROAS target), details drawer with changes.
- **New ads**: step panel — goods → budget & ROAS target → review.

## 8. Customers
- Buyers list: name, orders, spent, last order; pills All · Repeat buyers.
- **Buyer drawer**: contact & address (edit), order history linking to the order drawer.

---

## Order of work

| # | Section | Size |
|---|---|---|
| 1 | Orders + order drawer + Buy label steps | large |
| 2 | Shipping | small |
| 3 | Inventory + adjust / history | small |
| 4 | Returns & refunds + details drawer | medium |
| 5 | Price reviews | small |
| 6 | Promotions + enrol steps | medium |
| 7 | Ads + new ads steps | medium |
| 8 | Customers + buyer drawer | small |

## Non-goals
eBay and TikTok sections; new Temu API calls the token doesn't allow; changing how data is stored.
