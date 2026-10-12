---
name: browser-navigation
description: Navigate search results, pagination, product pages, category pages, and filters using the agent runtime's browser.
---

# Browser Navigation

## Purpose
Single shared convention for all page navigation, so marketplace skills reuse one
browsing capability instead of redundant engines.

## Steps
1. Prefer search-result and category pages; apply relevance/price/rating filters
   where available and record the filter state.
2. Paginate deterministically (page 1..N, cap N=5 per query) and log visited URLs.
3. On blocks (login wall, captcha, rate limit): stop, record the block, mark
   affected metrics `unavailable` — never circumvent access controls.
4. Hand rendered content to `web-data-extraction` / `dynamic-page-extraction`.

## Output (JSON)
`{ visitedUrls[], filtersApplied, pagesCapped: true, blocks[] }`

## Rules
- Respect robots/terms signals and rate limits; back off on 429s.
- No credential use, no purchase flows, no personal-data collection.
