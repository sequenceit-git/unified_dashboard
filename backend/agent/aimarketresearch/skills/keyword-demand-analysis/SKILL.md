---
name: keyword-demand-analysis
description: Investigate keyword interest, search trends, and demand signals for a category or product.
---

# Keyword Demand Analysis

## Purpose
Add search-side demand evidence (query interest, seasonality, rising terms) to
complement marketplace listing data.

## Steps
1. Expand seed keywords into demand probes: core term, "best X", "X review",
   problem queries ("X not working"), accessory queries ("X replacement").
2. Assess each probe via search-result depth, marketplace autocomplete presence,
   and any accessible trend surfaces; note seasonality signals.
3. Rate demand per probe (Strong/Moderate/Weak) with the observed signal quoted.

## Output (JSON)
`{ probes: [{ keyword, signal, rating, evidence }], seasonalityNotes, overallDemand }`

## Rules
- Autocomplete presence is weak evidence — report it as such, never as volume.
- No keyword-volume numbers without a cited tool/readout.
