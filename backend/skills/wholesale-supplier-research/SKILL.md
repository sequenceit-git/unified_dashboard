---
name: wholesale-supplier-research
description: Search wholesale marketplaces and supplier directories for manufacturers, MOQ, bulk pricing, lead times, and shipping terms.
---

# Wholesale Supplier Research

## Purpose
Find wholesale/supplier options (Alibaba, Made-in-China, Thomasnet, etc.) to ground
`profitAnalysis[].estimatedProductCost` in `MarketAnalysis`.

## Inputs
- `keywords` (string, required), `category` (string, optional), `limit` (default 8)

## Steps
1. Search supplier directories for the product or its closest generic equivalent.
2. Extract per supplier: name, URL, unit price breaks by quantity, MOQ, lead time,
   shipping terms (EXW/FOB/DDP), customization options, certifications claimed.
3. Rank by landed-cost plausibility, not headline unit price.

## Output (per supplier, JSON)
`{ supplierName, supplierUrl, unitPrice, currency, moq, priceBreaks[], leadTime,
shippingTerms, certificationsClaimed[], sourceUrl, dataCollectedAt }`

## Rules
- Directory listings are self-reported — hand off red flags to `supplier-verification`.
- Keep supplier PII minimal (business contact only, no personal data scraping).
- Apply `source-validation` and `research-freshness`.
