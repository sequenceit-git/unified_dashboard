---
name: competitor-analysis
description: Compare competing products, prices, reviews, positioning, and listing characteristics.
---

# Competitor Analysis

## Purpose
Map the competitive field per product: who sells it, at what price/quality tier,
and how entrenched they are.

## Steps
1. Group cross-marketplace twins (`research-deduplication`) into competitor sets.
2. Per competitor: price, rating × review count (moat size), seller tenure/type,
   listing quality (images, A+ content, variation depth), promotions.
3. Position on price-vs-reputation; name the moat (review mass, brand, fulfillment
   speed) and the gap (unmet need from `review-analysis`).

## Output (JSON per product)
`{ competitors: [{ name, marketplace, url, price, rating, reviewCount, moatNotes }], priceRange: { min, max, median }, gapSummary, competitionLevel }`

## Rules
- `competitionLevel` Low/Medium/High must follow the rubric in `product-scoring`.
- Review-count moats above 10k with 4.5★+ are High barriers — say so plainly.
