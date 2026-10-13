# Agent Skills — AI Market Research Pipeline

**Runtime:** OpenAI (Responses API + Web Search + Structured Outputs).  
**Location:** `backend/agent/aimarketresearch/skills/<skill-name>/SKILL.md` (Agent Skills Standard with YAML frontmatter `name` + `description`).  
**Registry Module:** [backend/agent/aimarketresearch/skills/index.js](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/agent/aimarketresearch/skills/index.js) (Programmatic stage loader for the AI market research agent).

---

## Pipeline Stage Grouping (35 Skills)

To prevent cognitive overload and maintain strict token budgets, the AI Agent loads skills progressively across 5 execution stages:

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Pipeline Orchestration & API Resilience            │
├─────────────────────────────────────────────────────────────┤
│ Stage 2: Web Search, Crawling & Source Discovery            │
├─────────────────────────────────────────────────────────────┤
│ Stage 3: Marketplace & Supplier Intelligence                │
├─────────────────────────────────────────────────────────────┤
│ Stage 4: Financial, Competitive & Sentiment Analysis        │
├─────────────────────────────────────────────────────────────┤
│ Stage 5: Reporting, Synthesis & Data Export                 │
└─────────────────────────────────────────────────────────────┘
```

---

### Stage 1: Pipeline Orchestration & API Resilience (`orchestration`)

Skills governing the research lifecycle, schema validation, rate-limits, and quality gates:

1. `marketplace-research-orchestration` — End-to-end multi-marketplace workflow coordinator.
2. `structured-research-output` — Mongoose schema alignment (`MarketAnalysis`, `ProductRecommendation`, `MarketplaceResearch`).
3. `research-quality-control` — Pre-save sanity checks, value bounds, and validation gates.

---

### Stage 2: Web Search & Source Discovery (`discovery`)

Skills governing query strategy, web crawling, URL gathering, and evidence freshness:

1. `web-search-strategy` — Search query formulation and multi-query research plans.
2. `deep-web-research` — Recursive search and source corroboration.
3. `browser-navigation` — Result traversal and pagination guidelines.
4. `web-crawling` — Link discovery and URL deduplication.
5. `dynamic-page-extraction` — Handling client-rendered data and lazy-loaded items.
6. `web-data-extraction` — HTML/JSON data parsing into clean models.
7. `data-validation-and-hygiene` — Validating real URLs, freshness audit, and cross-platform deduplication.

---

### Stage 3: Marketplace & Supplier Intelligence (`marketplace`)

Skills tailored to specific e-commerce platforms and wholesale directories:

1. `amazon-product-research` — ASIN, Buy Box, BSR trends, ratings.
2. `walmart-product-research` — WFS, seller classification, pricing.
3. `bestbuy-product-research` — Model specifications, consumer electronics pricing.
4. `ebay-product-research` — Completed/sold transaction comps, seller ratings.
5. `tiktok-shop-product-research` — Short-video virality, social proof, sales badges.
6. `temu-product-research` — Factory-direct pricing, quantity breaks, blitz sales.
7. `aliexpress-product-research` — Supplier pricing, ePacket/Choice shipping, MOQ.
8. `supplier-research-and-verification` — Wholesale directories, pricing breaks, factory verification, and risk flags.

---

### Stage 4: Financial, Competitive & Sentiment Analysis (`analysis`)

Skills governing economics, sentiment extraction, and ranking algorithms:

1. `market-analysis` — Demand levels, market outlook, macro trends.
2. `competitor-analysis` — Direct competitor landscape, differentiation angles.
3. `review-analysis` — Pain point extraction, customer sentiment, unmet needs.
4. `keyword-demand-analysis` — Search interest, volume momentum, customer intent.
5. `sales-estimation` — Evidence-backed demand modeling and estimation bounds.
6. `profitability-and-margin-analysis` — Landed cost stack, platform fees, margin math, and sensitivity scenarios.
7. `product-opportunity-scoring` — Auditable 0–100 multi-factor scoring rubric and opportunity prioritization.
8. `evidence-and-citation-management` — Citation verification and linking.

---

### Stage 5: Reporting, Synthesis & Data Export (`reporting`)

Skills governing the final output formatting and file deliverables:

1. `research-report` — Executive summary narrative and actionable takeaways.
2. `excel-product-export` — Clickable URLs, formatted currency, and tabular exports.

---

## Shared Conventions

1. **Never fabricate metrics**: When true sales volume or historical ranks cannot be observed, mark them as `estimated` with stated methodology or `unavailable`.
2. **Every metric must cite evidence**: Every data point includes `sourceUrl` and `dataCollectedAt`.
3. **Database Schema Compliance**: All emitted JSON documents conform directly to our backend Mongoose models.
