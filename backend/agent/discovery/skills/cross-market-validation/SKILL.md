---
name: cross-market-validation
description: Stage 2 of marketplace-best-seller-research. Run the master validation gates G1 to G10 on one candidate and collect up to one verified US product page per marketplace.
---

# Cross-Market Validation (Stage 2)

This stage carries out section 4 steps 5, 6, and 8 of the master skill `marketplace-best-seller-research`. Use the master's gates (section 6), platform notes (section 6.1), and normalization rules (section 7). Nothing here overrides them.

## Steps

1. **G1 Identity.** Open the given listing. Confirm title, ID, region, and price. Copy the description, feature bullets, and spec rows. Set matchConfidence: exact, equivalent, or similar. Never use "similar" listings for price or sales evidence.
2. **Find the same product** on eBay, Amazon, Walmart, and Temu (US). Return at most one product page per site in listingLinks. Omit a site you could not open.
3. **G3 Metric meaning.** For every sold, bought, or rank figure, record the exact wording and metricScope (lifetime, recent, unknown). Treat "2K+" as a floor. Never sum floors.
4. **eBay check.** Active listing count, low/median/high price of exact or equivalent items, sold count if visible. Distinguish listing-level sold counts from multi-variation totals.
5. **G4 Duplicates and variants.** Consolidate the same product across sellers only with strong identity evidence. Do not double count variation-parent reviews.
6. **G5 Manipulation.** Look for review bursts, near-identical reviews, mismatched reviews, implausible sold counts on a new listing, or extreme figures on a brand-new shop. List what you saw in manipulationFlags.
7. **G6 Independent corroboration.** Record one second signal from a different source or metric type (for example an Amazon rank plus review volume) in independentSignal. Leave it null if none exists.
8. **G7 Regional consistency.** US data only. Never merge figures from other countries.
9. **G8 Spike vs. sustained.** Compare short and longer windows when shown. Set velocity: rising, steady, spike, or unknown.
10. **G9 Compliance.** Note recalled, counterfeit-looking, restricted, or prohibited items in complianceFlags. The runner drops flagged products.
11. **Complaints.** Top 3 recurring complaints. Set highDefectRisk when one defect repeats.

## Demand tier

- High: strong sold counts or ranks on 2 or more marketplaces
- Medium: solid on one marketplace, moderate on another
- Low: weak or contradictory signals
- Unknown: not enough observable data

Set demandEvidence to "measured" (a sold count, rank, or badge you saw) or "inferred" (reviews only). Never convert to units per month unless the page states it.

## Output (strict JSON, nulls allowed)

matchConfidence, description, highlights[], specs[{name, value}], imageUrls[], ebayActiveListings, ebayPriceLow, ebayPriceMedian, ebayPriceHigh, ebaySoldCount, otherMarketplace, otherRating, otherReviewCount, listingLinks[], demandSignalText, officialRank, metricScope, velocity, independentSignal, manipulationFlags[], complianceFlags[], topComplaints[], highDefectRisk, demandTier, demandEvidence, competitionLevel

## Hard rules

- Every number comes from a page you opened, and its URL is returned. Otherwise null.
- listingLinks: ebay.com/itm, amazon.com/dp, walmart.com/ip, temu.com goods page, tiktok.com/shop/pdp, etsy.com/listing, or wish.com/product only, each opened in this search. Never write a URL from memory or guess an item ID or ASIN. No search pages, videos, or non-US domains or country paths. The backend re-checks every link and drops any it cannot confirm.
- If sources conflict, report both and let confidence drop. Do not pick the convenient value.
