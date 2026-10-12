---
name: marketplace-research-orchestration
description: Coordinate searches across multiple marketplaces and combine results into one research run.
---

# Marketplace Research Orchestration

## Purpose
Run the full pipeline for one discovery run: plan → collect → validate → analyze →
score → persist, across all requested marketplaces.

## Pipeline order
1. `web-search-strategy` → query plan.
2. Per marketplace (parallel): marketplace skill (`ebay-`, `tiktok-shop-`, `temu-`,
   `amazon-`, `walmart-`, `bestbuy-`, `aliexpress-product-research`) via
   `browser-navigation` → `web-data-extraction` / `dynamic-page-extraction`.
3. `research-deduplication` → `source-validation` → `research-freshness`.
4. Enrichment: `review-analysis`, `keyword-demand-analysis`, `competitor-analysis`,
   `sales-estimation`, `cost-and-margin-analysis` (+ `wholesale-supplier-research` /
   `supplier-verification` where sourcing matters).
5. Synthesis: `product-scoring` → `product-opportunities` → `profitability-analysis` →
   `market-analysis` → `research-report`.
6. `structured-research-output` (shape) → `research-quality-control` (gate) → persist
   `ResearchReport` + `MarketplaceResearch[]` + `ProductRecommendation[]` + `MarketAnalysis`.

## Output
Persisted `reportId` + evidence map; failures are per-marketplace (one host failing
never kills the run).

## Rules
- Budget: ≤60 product URLs, ≤15 deep pages, ≤25 queries per run.
- Partial results beat no results — record what was skipped and why.
