---
name: cross-market-validation
description: Validate one candidate product's demand, competition and customer sentiment on eBay first, then one or two other US marketplaces.
---

# Cross-Market Validation

## Purpose

Take ONE candidate and check whether it truly sells in the United States. Collect one verified product-page link on each of eBay, Amazon, Walmart, and Temu. Do not use other countries.

## Steps

1. Open the given listing first. Copy the product description, feature bullets, and specification table exactly as shown. Then identity-match the same product. Record matchConfidence: exact | equivalent | similar. Do not use "similar" listings for price evidence.
2. eBay check (primary channel, always do this first):
   - Number of active listings, and low/median/high price among exact or equivalent items
   - Sold counts if visible; median sold price if visible
3. Second-platform check (Amazon, Walmart or TikTok Shop): rating, review count, demand badges.
4. Review quality: prefer reviews from the last 12 months; note if reviews look incentivized or suspiciously uniform.
5. Complaints: list the top 3 recurring complaints (sizing, breaks, battery, etc.). Flag highDefectRisk if the same defect appears repeatedly.

## Demand tier (with evidence type)

- High: strong sold counts or badges across 2+ marketplaces
- Medium: solid on one marketplace, moderate on another
- Low: weak or contradictory signals
- Unknown: not enough observable data
Always set demandEvidence: "measured" (a sold count or badge you saw) or "inferred" (from review count only). Never convert to units per month unless a page states it.

## Output (strict JSON, nulls allowed)

matchConfidence, description, highlights[], specs[{name, value}], imageUrls[], ebayActiveListings, ebayPriceLow, ebayPriceMedian, ebayPriceHigh, ebaySoldCount, ebaySourceUrl, otherMarketplace, otherRating, otherReviewCount, otherUrl, listingLinks[], topComplaints[], highDefectRisk, demandTier, demandEvidence

## Hard rules

- Every number must come from a page you opened, and its URL must be returned. If not found, null.
- listingLinks has at most one URL per site: ebay.com/itm, amazon.com/dp, walmart.com/ip, temu.com goods page. Omit a site when you cannot open a real product page. Never return search pages or non-US domains.
- Suggested sell price is the eBay median, not the Amazon price.
