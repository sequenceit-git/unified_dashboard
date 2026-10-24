# Product Discovery Agent Skills

`marketplace-best-seller-research` is the master skill. `skills/index.js` builds each stage prompt with `skillManager.promptFor(stage)`: the master core first, then only the master references that stage needs, then the stage skill. Prompts are built once and cached, and stage text can never replace the master rules.

```
skills/
  marketplace-best-seller-research/     master
    SKILL.md                            mission, tiers, procedure, accuracy rules, dashboard defaults (section 12)
    references/
      platforms.md                      1 platform map, 6.1 platform notes
      evidence.md                       3.2 source reliability, 5 evidence record, 7 normalization
      validation.md                     6 gates G1 to G10
      scoring.md                        8 scoring, ranking, confidence
      report.md                         9 required output, 11 self-audit
  product-discovery-search/SKILL.md     Stage 1 (+ platforms, evidence)
  cross-market-validation/SKILL.md      Stage 2 (+ validation, platforms, evidence)
  opportunity-scoring-rubric/SKILL.md   Stage 3 notes (+ scoring)
```

## Run

- **US only.** Web search is located in the US and restricted to the domains in `US_PLACES` (`usListings.js`): ebay.com, amazon.com, walmart.com, temu.com, tiktok.com (TikTok Shop US), etsy.com, and wish.com. Country paths such as `/uk/` are rejected. US Shopify stores are the eighth shop: they are only added as extra listings by the `findMoreListings` search, never used to discover products, and their evidence never raises a product's tier.
- **Top 20.** `discoveryAgent.js` runs up to 4 search rounds (at most 80 candidates), skipping products already reviewed, until 20 products have at least one confirmed US listing. Results are ranked by evidence tier, then score, then the number of US shops the product is confirmed on (`economics.js`).
- **No unconfirmed links.** `usListings.js` re-checks every link before it is saved. eBay through the Browse API on EBAY_US; Shopify pages must also carry Product markup, a USD price, and Shopify markup; every other site by loading the page, which must stay on the same product ID, not be a bot wall or not-found page, and name the product. Unconfirmed links are dropped. Every confirmed listing is attached, one per shop. If none is confirmed, one extra open search looks for pages of the same product, and the product is dropped if still none is confirmed.

## Memory and state

- `evidenceMemory.js` reuses evidence records with `linksVerified` from runs that finished in the last 24 hours, matched by marketplace product ID (eBay item, ASIN, Walmart, Temu, TikTok, Etsy, Wish) or title, keeping the original `observedAt`.
- Candidates are de-duplicated before and after validation (gate G4).
- Run state is written only through `updateWhileRunning`, which also detects a user stop. Five products are checked at a time, and each confirmed product is appended with `$push` as soon as it passes; completion writes the ranked list once.
