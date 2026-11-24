# Shop API rollout — design

Written 2026-11-24 from the API coverage report (`docs/api-coverage/`, page
https://claude.ai/artifact/86CLRZA2dYCRip5wtPbZ7C). User request: plan how to use the unused
available APIs of the three shops, and how each shop's pages and layouts change for them. The
shops are fully separate (own backend app, sections, pages, forms), so each shop gets its own plan.

## Why

The dashboard calls 42 of eBay's 429 seller endpoints, 57 of TikTok Shop's 365 and 21 of
Temu's 133. The unused ones include the insight sellers ask for most: per-listing views and
click-through (eBay), per-product and per-video performance and shop health (TikTok), per-product
ad results (Temu), plus money detail, disputes/cases and feedback.

## Waves (the gaps grouped into features: one gap-note value = one feature)

- **Wave 1 — this round, one plan per shop.** High-priority features (plus the medium ones on the
  same page) that are small or medium and callable with the shop app's permissions, after at
  most a reconnect:
  - eBay: `docs/superpowers/plans/2026-11-24-ebay-api-wave1.md`
  - TikTok Shop: `docs/superpowers/plans/2026-11-24-tiktok-api-wave1.md`
  - Temu: `docs/superpowers/plans/2026-11-24-temu-api-wave1.md`
- **Wave 2 — large features, one plan each, after wave 1 ships:** eBay Promoted Listings (new
  section: campaigns, ads, ad reports, recommendations — 58 endpoints); eBay dispute contest /
  case appeal / return escalation with evidence files; Temu create/edit/delete goods; Temu buy
  shipping labels; TikTok features behind scopes the connector app doesn't hold yet (affiliate
  collaborations and samples, package split/combine, product optimisation) once the app's scope
  list (`docs/api-coverage/apps/tiktok_shop.json`) is filled in from Partner Center.
- **Wave 3 — the remaining medium/low gaps**, picked from the report when needed. Not planned now.

## Page and layout rules (all shops, each implemented inside its own shop folder)

1. **A section page is tabbed by that shop's own API areas.** A section loader's tables carry a
   `tab` (e.g. eBay Returns & cases: Returns | Inquiries | Cases | Payment disputes); the shop's
   page renders `components/ui/Tabs` over the distinct tabs, in loader order, and the tables of
   the active tab below. One tab → no tab bar (today's look). Summary tiles may also carry `tab`;
   tiles without one show on every tab.
2. **Insight goes where the seller already looks:** listing traffic and seller level in Analytics,
   earnings in Payouts/Finance, the order price breakdown in the order drawer, Temu's recommended
   price in Price reviews. New sections only for wave-2 features with no home (eBay Promoted
   Listings).
3. **Row actions stay per shop:** a table row may carry `actions: [{ id, label, confirm? }]`; the
   shop's page posts `POST /api/<shop>/sections/<section>/<action>` and reloads the section. Each
   action route uses the existing `sectionGuard(<section>)`.
4. **A failing API never blanks a page:** `sectionKit.tables` already isolates each table; a
   permission error shows the table with a plain message naming what to do ("Reconnect eBay to
   allow listing traffic"), not the raw API error.
5. Shared UI primitives (`components/ui/*`, `sectionKit`) may be used; no page, form or section
   file is shared between shops.

## Permissions

- **eBay:** the token asks for six scopes. Wave 1 needs four more, as eBay's contracts list them
  per endpoint: `sell.analytics.readonly` (traffic, seller level), `sell.finances.earnings.read`
  (order earnings), `sell.payment.dispute` (payment disputes), `commerce.feedback` (feedback).
  `sell.marketing` (already asked) covers the promotion report; Post-Order uses the token as is.
  Existing eBay
  shops must reconnect once; the dashboard tells them which features the reconnect turns on. A
  scope the eBay keyset doesn't allow breaks the consent page for everyone, so the extra scopes
  come from an env setting that can be emptied without a deploy.
- **TikTok:** wave 1 uses only scopes the app provably holds (`apps/tiktok_shop.json`).
- **Temu:** the token's granted API list (`bg.open.accesstoken.info.get` → `apiScopeList`) is read
  at connect/refresh and stored; a feature whose method isn't granted shows "not enabled for this
  app in the Temu partner account" instead of failing.

## Done means

Each wave-1 plan ends with `npm run api-coverage` showing its endpoints as covered, a test pinning
that list, all backend and frontend tests green, and a final review.

## Decided here (user may change at plan review)

- Split into a roadmap + one wave-1 plan per shop (scope too big for one plan: 125 features).
- eBay `offer/get_listing_fees` (Inventory API) is out: the dashboard lists through the Trading
  API, whose verify calls already return fees. eBay Recommendation API moves to wave 2 with
  Promoted Listings (its only output is ad-rate advice).
- Contest/appeal/escalate flows that need evidence uploads are wave 2; wave 1 reads disputes,
  inquiries and cases and does the one-click actions (accept, refund, mark received).
