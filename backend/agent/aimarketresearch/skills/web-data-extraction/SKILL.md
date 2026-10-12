---
name: web-data-extraction
description: Extract structured product information from accessible HTML and rendered pages into consistent JSON.
---

# Web Data Extraction

## Purpose
Convert product/search pages into the `MarketplaceResearch` JSON shape consistently,
regardless of marketplace.

## Steps
1. Identify page type (search grid, product detail, reviews section, seller page).
2. Extract fields per the `structured-research-output` schema; use `null` for absent
   fields — never N/A strings or zeros that imply measurement.
3. Capture the exact source URL + `dataCollectedAt` timestamp per record.
4. Flag JS-gated content for `dynamic-page-extraction` instead of guessing.

## Output
`MarketplaceResearch`-shaped JSON objects (see `structured-research-output`).

## Rules
- Prices must include currency; convert nothing silently (record raw + currency).
- Ratings without review counts are weak signals — keep both or neither.
