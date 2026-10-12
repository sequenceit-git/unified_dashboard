---
name: web-crawling
description: Discover product URLs, follow allowed links, handle pagination, deduplicate results, and enforce crawl limits.
---

# Web Crawling

## Purpose
Bounded URL discovery feeding the extraction skills — breadth without runaway crawls.

## Limits (hard)
- Max 60 product URLs per research run; max depth 2 from seed pages.
- Max 5 paginated pages per listing query; 2s minimum between requests.
- Same-host concurrency of 1.

## Steps
1. Seed from `web-search-strategy` queries + marketplace category pages.
2. Follow product links only (skip ads, login, checkout, account URLs).
3. Deduplicate continuously (`research-deduplication`) and stop a branch when hit
   novelty drops (3 consecutive pages, no new products).

## Output (JSON)
`{ discoveredUrls[], skipped: [{ url, reason }], limitsHit[] }`

## Rules
- No external crawler services as a required dependency — agent runtime tools only.
- On 429/block: back off and record; never rotate identities to evade limits.
