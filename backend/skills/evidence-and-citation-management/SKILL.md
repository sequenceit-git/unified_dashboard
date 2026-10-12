---
name: evidence-and-citation-management
description: Attach source URLs and supporting evidence to claims, metrics, and recommendations.
---

# Evidence & Citation Management

## Purpose
Make every report auditable: each claim links to the source records behind it.

## Steps
1. Assign record IDs to all `MarketplaceResearch` rows at collection time.
2. Every downstream artifact (recommendation reason, trend evidence, opportunity
   `sourceUrls`, narrative claim) references ≥1 record ID + URL.
3. Emit an evidence map per report: claim → record IDs → URLs → collected-at.

## Output (JSON)
`{ reportId, evidenceMap: [{ claim, recordIds[], urls[], collectedAt[] }], orphanClaims[] }`

## Rules
- `orphanClaims` (claims with no source) must be zero before a report completes —
  either cite or delete the claim (`research-quality-control` enforces).
- URLs must be the exact observed page, not search-engine redirect links.
