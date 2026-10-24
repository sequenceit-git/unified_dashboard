# Validation gates (master section 6)

Every candidate must pass or be downgraded.

| Gate | Check | If it fails |
|---|---|---|
| G1 Identity | The URL resolves to the stated product, region, and seller; title, ID, and price match the record | Drop, or fix the record |
| G2 Freshness | Observation is within the requested window or at most 7 days old for trend claims; listing is live | Mark stale and lower confidence; drop if unavailable and the user wants buyable products |
| G3 Metric meaning | The demand number's definition is known (lifetime vs. period, rounded floor vs. exact, listing vs. product vs. shop) | Do not compare it with other metrics; label "definition unclear" and cap confidence at Low |
| G4 Duplicates and variants | Same product listed multiple times, by multiple sellers, or as bundles/variations is consolidated or flagged; unit counts are not double counted | Consolidate; note the method |
| G5 Manipulation and anomalies | Check for sudden review bursts, near-identical reviews, unverified-purchase patterns, implausibly high sold counts for a new listing, steep temporary discounts, brand-new shops with extreme figures, mismatched reviews (reviews from a different product merged into the listing) | Flag and cap confidence at Low unless explained by an independent signal |
| G6 Independent corroboration | At least one second signal from a different source or metric type (for example platform rank plus review velocity, or sold count plus search interest) | Cap confidence at Medium; if only one T4/T5 signal exists, Low |
| G7 Regional consistency | Data is from the stated region; cross-region data is never merged | Separate or drop |
| G8 Spike vs. sustained demand | Compare short and longer windows where data exists; a single-day spike is not a best seller | Label "spike" or "possible fad" |
| G9 Compliance sanity | Obvious red flags such as restricted, counterfeit-looking, recalled, or prohibited categories are noted | Flag in caveats; do not recommend without review |
| G10 Reproducibility | A reader could repeat the lookup from the recorded URL, query, filter, and time | Add the missing detail |

Numbers must be traceable: every figure in the report must map to an evidence record. If it cannot, delete it.
