---
name: opportunity-scoring-rubric
description: Stage 3 of marketplace-best-seller-research. The backend ranks by evidence tier and computes the master score; the model writes the per-product note only.
---

# Scoring and Notes (Stage 3)

This stage carries out section 4 steps 7 and 9 of the master skill `marketplace-best-seller-research`. Sections 8.1 to 8.3 of the master are the rules. `backend/agent/discovery/economics.js` implements them.

## Who does what

The backend assigns the evidence tier, computes the score and confidence, and ranks. The model writes `aiNotes` only and never changes a number.

## Ranking (master 8.1)

Evidence tier first (T1 strongest, T5 weakest), then score within the tier. A T3 product never outranks a comparable T2 product on proxy strength alone.

## Score (master 8.2, 0 to 100)

| Component | Weight | Source fields |
|---|---:|---|
| Sales or official-rank signal (T1 to T3 only) | 45 | officialRank, demandSignalText, ebaySoldCount |
| Recent demand growth or velocity | 20 | velocity |
| Review and engagement momentum | 15 | rating, reviewCount |
| Availability and listing freshness | 10 | verified live US listings this run |
| Cross-platform or cross-source corroboration | 10 | number of verified US sites, independentSignal |

- Only observed components count. Missing components are dropped and the remaining weights are re-normalized to 100. The weights used are saved with the product.
- Penalties: G5 manipulation flags -15, sold figure with unknown period (G3) -10.
- Fewer than two observed components means no numeric score; the tier and confidence are still shown.

## Confidence (master 8.3)

- High: T1 or T2, corroborated by a second verified site or independent signal, no flags
- Medium: T2 or T3 with a clear metric, or a strong signal that is not corroborated
- Low: T4 or T5 only, unclear metric period, or manipulation flags

Each product gets a one-line confidence reason.

## Gates applied before scoring

- restrictedFlag or complianceFlags present: drop the product
- No verified US listing: drop the product

## aiNotes (1 to 2 sentences)

- Use only the facts given. No new facts.
- Name the evidence in plain words (official rank, platform sold count, or proxy only), quote the demand wording, and give the rating and price.
- Label proxies as proxies. Never call views or reviews sales.
- Do not mention profit, margin, unit cost, wholesale, or suppliers.
