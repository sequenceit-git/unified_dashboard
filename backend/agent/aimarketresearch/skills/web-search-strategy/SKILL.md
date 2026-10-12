---
name: web-search-strategy
description: Generate targeted search queries, search operators, marketplace-specific queries, and multi-query research plans.
---

# Web Search Strategy

## Purpose
Turn a research brief (`category`, `keywords`, `marketplaces`) into a query plan with
coverage tracking, so evidence gathering is systematic rather than ad hoc.

## Inputs
- `category`, `keywords[]`, `marketplaces[]`.

## Steps
1. Emit query sets per marketplace: plain keyword, `site:`-scoped, price-anchored
   (`"under $X"`), review-anchored (`"best rated"`), and problem-anchored
   (`"complaints"`, `"vs"`, `"alternative"`) queries.
2. Assign each query a target skill (`ebay-product-research`, etc.) and an evidence
   goal (price / rating / sales signal / review themes).
3. Track coverage: query → executed (yes/no) → hits kept/discarded.

## Output (JSON)
`{ planId, queries: [{ query, marketplace, goal, executed, hitsKept }], coverageNotes }`

## Rules
- Cap at ~25 queries per run (see `web-crawling` limits); prioritize money questions first.
- Reuse the plan across marketplaces where queries overlap — no redundant engines.
