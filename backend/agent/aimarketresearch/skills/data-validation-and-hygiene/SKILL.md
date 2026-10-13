---
name: data-validation-and-hygiene
description: Validate real source URLs, audit metric freshness, deduplicate listings across marketplaces, and prune invalid entries.
---

# Data Validation & Hygiene

## Purpose
Ensure every datapoint in `MarketplaceResearch`, `ProductRecommendation`, and `MarketAnalysis` is verifiable, current, deduplicated, and attributed to genuine URLs.

## Core Pillars

### 1. Source URL Verification
- Every product listing must include a direct, reachable `sourceUrl` or `productUrl` (e.g., live Amazon, Walmart, or eBay listing).
- Classify sales data reliability:
  - `actual`: Directly observable sales figures (e.g., "10K+ bought in past month" badge).
  - `estimated`: Statistically derived estimate from sales rank (BSR) or review growth models.
  - `unavailable`: Data cannot be reliably determined (never invent numbers).

### 2. Research Freshness & Volatility
- Tag all records with collection timestamps (`dataCollectedAt`).
- Metric volatility hierarchy:
  - **Volatile (24h)**: Active selling price, Buy Box ownership, in-stock status, search rankings.
  - **Stable (7–30d)**: Review count, overall star rating, core product specifications, manufacturer identity.
- Flag or discard stale pricing data.

### 3. Cross-Marketplace Deduplication
- Detect duplicate products across multi-platform queries using:
  1. Identifiers (ASIN, UPC, model numbers in title/URL).
  2. Normalized brand + title token matching.
- **Twin Linking**: Link identical items across different marketplaces (e.g., same item found on Amazon and Walmart) to enrich price comparison rather than treating them as separate inventions.

## Rules
- Never accept placeholder URLs (`example.com`, `#`, `mock-url`).
- Remove duplicate variants (size/color listings of identical parent products) to keep recommendation tables distinct.
