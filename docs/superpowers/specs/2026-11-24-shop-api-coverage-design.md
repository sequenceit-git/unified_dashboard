# Shop API coverage — design

Agreed 2026-11-24 (brainstorming; approved by moving to the plan).

## Why

List every official seller API endpoint of eBay, TikTok Shop and Temu, see which ones the
dashboard does not use yet, and then implement the missing ones (the user applies them afterwards,
one shop at a time, each with its own plan).

## Approach (picked: B)

- A. Full catalog only — complete, but the gaps that matter are buried.
- **B. Full catalog + ranked gap list (picked)** — the gap list is the deliverable, the catalog is
  the proof.
- C. Gaps only — fastest to read, but nothing to check what was skipped.

## Deliverable

1. **Gap list per shop:** every missing endpoint, grouped by the dashboard section it belongs in
   (or "new section"), with name + method/path (or call name), what it gives the seller (e.g. eBay
   Analytics `getTrafficReport`: views, impressions, click-through per listing), the scope /
   permission it needs, and a size (small / medium / large).
2. **Full catalog** behind it: every endpoint marked covered (with the file that calls it) or
   missing.
3. Formats: a shareable web page (tables per shop, filters) and the data in the repo under
   `docs/api-coverage/`.

## Rules

- Official references only: eBay developer docs (all Sell REST APIs + Trading API + Post-Order +
  Commerce APIs sellers use), TikTok Shop Partner Center API reference, Temu Partner Platform docs.
- "Covered" = actually called from `backend/marketplaces/<shop>/` (not merely mentioned).
- Buyer-side / non-seller APIs (e.g. eBay Buy APIs) are listed as "not for sellers", not as gaps.
- Temu endpoints that can't be confirmed publicly are marked "confirm in partner account", never
  guessed.
- No product code changes in this work.
