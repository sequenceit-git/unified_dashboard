---
name: review-analysis
description: Summarize permitted review data and unmet customer needs from accessible reviews.
---

# Review Analysis

## Purpose
Extract themes from publicly accessible reviews into `reviewSummary { positive[],
negative[] }` and surface unmet needs (differentiation angles).

## Steps
1. Sample up to 30 accessible reviews per product (never bypass login walls).
2. Cluster into positive themes (what buyers praise) and negative themes
   (complaints, failure modes) with frequency counts.
3. Derive 1–3 unmet needs: recurring complaints a new listing could address
   (bundle, sizing clarity, durability, instructions).

## Output (JSON per product)
`{ reviewSummary: { positive[], negative[] }, unmetNeeds[], reviewsSampled, sourceUrl }`

## Rules
- Quote briefly and factually; no reviewer PII beyond public usernames already shown.
- Review text is copyrighted user content — summarize, don't bulk-reproduce.
- Small samples (< 10) get a low-confidence note.
