---
name: source-validation
description: Verify product facts and metrics match their source URLs and distinguish observed data from estimates.
---

# Source Validation

## Purpose
Gate every metric before it enters `MarketplaceResearch` / scoring: observed vs
estimated vs unavailable, with proof.

## Steps
1. For each metric, check: present on the source URL? timestamped? methodology known?
2. Classify: `actual` (directly observed count/figure), `estimated` (documented
   inference method), `unavailable` (everything else).
3. Downgrade on conflict between sources; keep the conflict note, pick the
   conservative value, and cite both.

## Output (JSON per record)
`{ url, checks: [{ metric, verdict, evidence }], conflicts[], overallTrust: "high" | "medium" | "low" }`

## Rules
- A metric without a reachable source URL is `unavailable`, no exceptions.
- Promo badges ("X sold", "trending") are marketing until proven otherwise.
