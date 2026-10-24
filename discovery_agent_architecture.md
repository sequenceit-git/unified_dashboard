# Product Discovery Agent — Architecture & Workflow

End-to-end flow from **Launch AI Research** on the Product Discovery page (`/market-research`) to the ranked, verified product list. The agent follows the master skill `marketplace-best-seller-research`; see `backend/agent/discovery/skills/README.md` for how the skill prompts are built.

```
[ NewRunModal ] ── POST /api/research/generate
         ▼
[ routes/research/research.js ] ── creates ResearchReport (status: queued), replies 202
         ▼
[ agent/discovery/discoveryAgent.js ]  up to 3 rounds, until 20 products are confirmed
         ├── Stage 1  discoverCandidates   US marketplaces search + independent US stores search (in parallel)
         ├── memory   evidenceMemory.js    reuse evidence observed in the last 24 hours
         ├── Stage 2  validateProductDemand gates G1–G10, description/specs, same product on other US sites
         ├── links    usListings.js        every link re-checked; unconfirmed links and products dropped
         ├── score    economics.js         evidence tier + 0–100 score + confidence (no LLM math)
         ├── Stage 3  generateAiNotes      short factual note, no URLs
         └── save     $push per batch of 3; final ranked list on completion
         ▼
[ ProductDiscoveryPage ] polls GET /api/research/status/:id every 2.5 s, then loads the cards
```

## 1. Launch (frontend)

`NewRunModal.jsx` collects categories, an optional niche, and custom instructions. Research does not depend on any of the client's shops; each result is listed in eBay, TikTok Shop, or Temu afterwards from its card.

## 2. Route (`backend/routes/research/research.js`)

1. Rejects with 409 if another run is `queued` or `running`, and with 503 if no OpenAI key is set.
2. Creates a `ResearchReport` (`models/ResearchReport.js`, collection `research_reports2`) with `status: 'queued'`.
3. Replies 202 at once and starts `runDiscoveryAgent` in `setImmediate`.

Other endpoints: `GET /reports`, `GET /status/:id`, `GET /recommendations/:id` (fills in missing images), `GET /export/:id?format=csv|xlsx`, `POST /stop/:id`, `DELETE /reports/:id`, `POST /add-to-catalog`.

## 3. Where the agent searches (US only)

All web searches use a US location.

- **Marketplaces** (search restricted to these domains): eBay, Amazon, Walmart, Temu, TikTok Shop, Etsy, Wish. Non-US sites and country paths (`ebay.co.uk`, `etsy.com/uk`, `temu.com/uk`) are rejected.
- **Independent US stores** on Shopify, WooCommerce, BigCommerce, Adobe Commerce/Magento, Salesforce Commerce Cloud, VTEX, Wix, Squarespace, Square, Ecwid, PrestaShop, OpenCart, and Shift4Shop. About 30% of each round's candidates come from this search. A store's own "Best sellers" label is Tier 4 evidence and never counts as a platform rank.
- Zendesk is not a store and is not searched. There is no supplier, wholesale, or profit-margin research.

## 4. Run loop (`discoveryAgent.js`)

1. **Stage 1** asks for up to 25 new candidates per round, skipping titles already tried. Each candidate carries its demand wording quoted from the page, official rank, evidence tier (T2 to T5), metric scope, rating, and reviews.
2. **Memory**: a candidate already confirmed in a run from the last 24 hours (matched by marketplace product ID, store URL, or title) is reused with its original `observedAt` instead of being searched again.
3. **Stage 2** opens the listing and records the description, highlights, specs, eBay prices and sold count, velocity, a second independent signal, and manipulation and compliance flags. It returns product pages for the same item on the other US sites. A product with compliance flags is dropped.
4. **Link check** (`usListings.js`):
   - eBay: the item must exist through the official Browse API (EBAY_US), and its title must match.
   - Other marketplaces: the page must load (status 200), stay on the same product ID, not be a bot or not-found page, and name the product.
   - Stores: the same checks, plus Product markup, a USD price, and a known platform's markup.
   - At most one page is kept per marketplace, plus up to three stores. A product with no confirmed page is dropped. Demand wording from an unconfirmed page is not used.
5. **Scoring** (`economics.js`): the tier comes from the recorded fields. The score weights are sales 45, velocity 20, reviews 15, freshness 10, corroboration 10, with penalties for manipulation and unclear metrics. Results are ranked by tier first, then score.
6. **Stage 3** writes a short note from the verified facts only.
7. Each batch of 3 is appended with `$push`, so a stop or crash keeps what was found. A user stop is detected when `updateWhileRunning` matches nothing. On completion the report gets the ranked list, a summary of tier counts, and a note if fewer than 20 products were confirmed. On server boot, `stopping` runs become `stopped` and stale `queued`/`running` runs become `failed`.

## 5. Results (frontend)

- `OpportunityCard.jsx` shows rank, marketplace, evidence tier, score (or "—" when there is too little evidence), demand wording, and a live link only when `linksVerified` is true.
- `ProductDetailModal.jsx` shows images, description, highlights, specs, evidence facts, the confidence reason, and "Where it is selling" with each confirmed US page. Older reports without verified links show no links.
- **Exports**: CSV (guarded against formula injection) and Excel. Link columns hold only confirmed links.
- **Add to catalog** creates a draft product (stock 0, SKU `BOT-<CAT>-<time><random>`) with `sourceReportId`, and records the listed shop on the opportunity.
