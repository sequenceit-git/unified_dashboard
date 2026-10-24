# Scoring and ranking (master section 8)

## 8.1 Primary rule

Rank by **evidence tier first**, then by score within the tier. A T3 candidate does not outrank a comparable T1/T2 candidate on weak proxy strength alone. Show tier in the table.

## 8.2 Documented score (0 to 100) when metrics exist and are comparable

| Component | Weight |
|---|---:|
| Sales or official-rank signal (T1 to T3) | 45 |
| Recent demand growth or velocity | 20 |
| Review and engagement momentum (recent and credible) | 15 |
| Availability and listing freshness | 10 |
| Cross-platform or cross-source corroboration | 10 |

Rules:
- Compute only components with real data. If a component is `Unavailable`, **re-normalize the remaining weights to 100** and state this per product. Never assign a zero or an invented value silently.
- Subtract penalties and show them: validation flags from G5 (up to -15), stale data (up to -10), definition-unclear metrics (up to -10).
- Publish the weights actually used and any changes from this default.
- If fewer than two components have data, do not output a numeric score; output the tier and confidence only.

## 8.3 Confidence rubric

| Confidence | Requirements |
|---|---|
| High | T1 or T2 evidence, passes G1 to G7, corroborated by an independent signal, observed within 7 days |
| Medium | T2 or T3 evidence with corroboration, minor gaps, or high-quality T3 with clear metric definition |
| Low | T4 or T5 only, unclear metric definition, G5 flags, stale data, single source, or estimates from third-party tools |

Confidence must be justified in one short sentence per product.
