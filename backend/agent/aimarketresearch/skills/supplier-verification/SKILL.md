---
name: supplier-verification
description: Validate supplier legitimacy, business details, certifications, product consistency, and red flags.
---

# Supplier Verification

## Purpose
Screen suppliers found via `aliexpress-product-research` / `wholesale-supplier-research`
before they influence recommendations.

## Inputs
- Supplier record(s) from upstream skills.

## Steps
1. Cross-check business name, tenure, transaction/review history, and claimed
   certifications across at least two sources.
2. Compare product photos/specs across the supplier's listings for consistency
   (stock-photo reuse, spec contradictions).
3. Score red flags: brand-new storefront with big review counts, price far below
   cluster, no verifiable business identity, refusal signals in Q&A/reviews.

## Output (per supplier, JSON)
`{ supplierName, verdict: "verified" | "caution" | "reject", findings[], redFlags[],
sources[], checkedAt }`

## Rules
- `reject` on identity fraud signals; `caution` on thin history — never silently pass.
- State what could NOT be verified; verification is risk reduction, not a guarantee.
- Feed the verdict into `risks[]` in `MarketAnalysis` when the supplier backs a recommendation.
