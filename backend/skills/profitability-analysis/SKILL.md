---
name: profitability-analysis
description: Explain margin assumptions and sensitivity scenarios for the profitAnalysis section.
---

# Profitability Analysis

## Purpose
Produce `profitAnalysis[]` in `MarketAnalysis`: per-product unit economics with
explicit assumptions and sensitivity notes.

## Inputs
- Selling price evidence, landed-cost candidates (`aliexpress-product-research` /
  `wholesale-supplier-research`), fee tables per marketplace.

## Steps
1. Build the cost stack: product cost + shipping + marketplace fees + marketing +
   other; compute profit/unit and margin % (`cost-and-margin-analysis` math).
2. Record every number's basis in `assumptions[]` (e.g., "shipping $4.20 via
   AliExpress standard to US, Oct 2026").
3. Add sensitivity: ±20% cost and −10% price scenarios in one line each.

## Output
`profitAnalysis[]` entries (see `structured-research-output`).

## Rules
- Unknown costs are explicit `null` + assumption notes, never hidden zeros.
- Margin % = profit / selling price; state the fee rate used per marketplace.
