---
name: research-deduplication
description: Merge duplicate products across search results and marketplaces using URLs, identifiers, titles, and variants.
---

# Research Deduplication

## Purpose
Ensure one real-world product = one candidate, even when it appears on several
marketplaces or as multiple variant listings.

## Match keys (in order)
1. Marketplace item ID / ASIN / SKU from URL.
2. Normalized title similarity (brand + core tokens, ignore color/size words).
3. Image similarity note + overlapping spec values.

## Steps
1. Cluster candidates by match keys; keep the richest record as canonical.
2. Link cross-marketplace twins (same product, different `marketplace`) instead of
   merging — twins power `competitor-analysis` and price comparison.
3. Merge variant listings (color/size) into one record with a `variantsObserved` count.

## Output (JSON)
`{ clusters: [{ canonicalId, mergedIds[], crossMarketplaceTwins[] }], remainingCount }`

## Rules
- Never merge across different brands/models on title similarity alone.
- Keep every merged source URL in the canonical record's evidence trail.
