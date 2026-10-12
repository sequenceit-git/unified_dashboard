---
name: excel-product-export
description: Export ranked recommendations to Excel with clickable product URLs, filters, and useful column formatting.
---

# Excel Product Export

## Purpose
Local replacement for the unavailable official `spreadsheet` skill: turn a report's
ranked recommendations into a shareable `.xlsx` for the client.

## Columns (in order)
Rank | Product | Category | Marketplace | Price | Currency | Est. Monthly Sales |
Est. Monthly Revenue | Rating | Reviews | Competition | Margin % | Opportunity Score |
Reason | Product URL (clickable hyperlink) | Evidence URLs | Collected At

## Steps
1. Pull the report's `ProductRecommendation[]` (rank order) + evidence map.
2. Build the workbook: header row frozen, auto-filter on, score/margin as numbers
   (0–100 / %), URLs as hyperlinks, `Collected At` as dates.
3. Add a `Notes` sheet: run scope, methodology, data-tier legend
   (actual/estimated/unavailable), and the decision-support disclaimer.

## Rules
- Implementation uses a maintained workbook library chosen at build time
  (e.g., ExcelJS); no data leaves the server to third-party export services.
- Estimates are labeled in-cell (e.g., "1,200 (est.)"), never bare numbers.
