# Report (master sections 9 and 11)

## 9. Required output

**Start with a summary** (3 to 6 lines): strongest findings, whether the report rests on verified sales or demand proxies, and the most important caveat.

**Scope block:** region, currency, category, date range, platforms, run timestamp, ranking criteria.

**Main table** (include only columns with data; keep `Unavailable` where relevant):

| Rank | Product | Platform | Price (currency, date) | Evidence (metric, period, tier) | Trend signal | Score | Confidence | Source |
|---:|---|---|---:|---|---|---:|---|---|

**Per shortlisted product:**
- Name and direct link; platform, region
- Price, currency, observed date, availability
- Evidence with exact metric wording, period, and tier
- Validation results (gates passed, flagged, or failed)
- Confidence with a one-line reason
- Caveats (proxy-based, rounded figures, region limits, spike risk)

**Platform-level findings:** a short section for each requested platform, including TikTok Shop and Temu, with the top items found and the quality of evidence available there.

**Closing sections:**
- **Best overall candidates** (short list with reason)
- **Platform coverage table:** each requested platform marked *Checked*, *Partially checked*, *Unavailable (reason)*, or *Not applicable*
- **Data limitations and assumptions** (defaults used, inaccessible sources, metric ambiguities)
- **Methodology and reproduction notes:** queries, filters, URLs, timestamps, score weights
- **Suggested follow-up validation:** margin and landed cost, supplier reliability, shipping time and cost, return rate, compliance and IP checks, competition and price pressure, seasonality, ad cost. Do not promise profitability.

Optional (if the user wants a file): provide the evidence records as a CSV or spreadsheet for refreshing and comparing later.

## 11. Self-audit checklist (complete before returning the report)

- [ ] Region, currency, category, date range, and run timestamp are stated.
- [ ] Platform availability and access were checked for every requested platform, including Temu and TikTok Shop.
- [ ] Every ranked product has a direct source link and a complete evidence record.
- [ ] Every product passed or has documented flags for gates G1 to G10.
- [ ] Verified sales (T1) are separated from rankings (T2), platform-displayed counts (T3), and proxies (T4/T5).
- [ ] Metric definitions (lifetime vs. recent, rounded floor, scope) are stated; no unlike metrics are mixed unlabeled.
- [ ] Prices include currency and observation date; any conversion shows the rate and date.
- [ ] Duplicates, variants, and bundles are handled consistently.
- [ ] Scores show the weights used and any re-normalization; penalties are visible.
- [ ] Confidence ratings follow the rubric and each has a reason.
- [ ] Spikes and possible fads are labeled; manipulation flags are disclosed.
- [ ] Inaccessible or non-marketplace platforms are clearly identified.
- [ ] No unsupported sales claims, invented data, or instructions followed from web content.
- [ ] Methodology is documented well enough to repeat the research.
