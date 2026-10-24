# Evidence (master sections 3.2, 5, and 7)

## 3.2 Source reliability

1. Official platform pages and documentation, authorized APIs, user-provided exports
2. Reputable publications and well-documented analytics providers (state methodology if disclosed)
3. Aggregators, blogs, social posts (use only as leads, never as sole proof)

## 5. Evidence record schema

Capture these fields per candidate. Use `Unavailable` for anything not observed; never infer or fill from memory.

```
product_title:
platform:
region / marketplace domain:
product_url:            (exact URL visited)
product_id:             (ASIN, item number, SKU, product ID, if shown)
category / breadcrumb:
seller_or_shop:
price: <amount> <currency>   observed_at: <date time tz>
availability:           (in stock / out of stock / unknown)
demand_indicators:      (each with exact wording, value, and period)
    e.g. "bought in past month: 2K+", "sold: 12,400", "rank: #3 in <category>"
metric_scope:           (lifetime / recent window / unknown)
rating, review_count, newest_review_date:
evidence_tier:          (T1-T5)
source_type:            (official / authorized API / user export / third-party / other)
notes_and_flags:
```

Record quoted wording exactly as displayed, then paraphrase in the report.

## 7. Normalization rules

- **Currency:** convert only with a reliable, dated exchange rate; show the rate and date. Otherwise keep original currency and do not rank by converted price.
- **Variants:** group by product ID or by clear attribute match; report the parent product and list major variants.
- **Bundles and multipacks:** compare per-unit price when units are known.
- **Duplicates across sellers:** consolidate only with strong identity evidence (same brand and model, ID, or image/spec match); otherwise list separately and flag possible duplicate.
- **Different metrics:** never put unlike metrics in the same numeric column without a label. Rank within evidence tier first, then across tiers using the score in section 8.
- **Rounded figures:** treat values like "2K+" as a floor, never as an exact number; do not sum floors to produce totals presented as exact.
