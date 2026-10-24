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

- **US only.** Web search is located in the US and restricted to ebay.com, amazon.com, walmart.com, and temu.com.
- **Top 20.** `discoveryAgent.js` runs up to 3 search rounds (at most 60 candidates), skipping products already reviewed, until 20 products have a confirmed US listing. Results are ranked by evidence tier, then score (`economics.js`).
- **No unconfirmed links.** `usListings.js` re-checks every link before it is saved. eBay through the Browse API on EBAY_US; Amazon, Walmart, and Temu by loading the page, which must stay on the same product ID, not be a bot wall or not-found page, and name the product. Unconfirmed links are dropped; a product with none is dropped.

## Memory and state

- `evidenceMemory.js` reuses evidence records with `linksVerified` from runs that finished in the last 24 hours, matched by eBay item ID, Amazon ASIN, Walmart ID, Temu goods ID, or title, keeping the original `observedAt`.
- Candidates are de-duplicated before and after validation (gate G4).
- Run state is written only through `updateWhileRunning`, which also detects a user stop. Each batch appends its new products with `$push`; completion writes the ranked list once.
