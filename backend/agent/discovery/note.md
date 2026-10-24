# Developer Notes — Skills Origin & Consolidation History

> **INTERNAL DEVELOPER REFERENCE ONLY**  
> Do not refer to, load, or cite this file in agent runtime execution or documentation.

---

## 1. Skill Origins & Download Sources

The initial skills library was sourced and structured based on standard agent skill best practices for e-commerce intelligence and web scraping pipelines (standard Agent Skills format using `SKILL.md` with YAML frontmatter).

- **E-Commerce & Market Intelligence Standards**: Derived from open e-commerce research patterns (Amazon BSR & Buy Box heuristics, Walmart seller analysis, eBay sold listings, TikTok Shop trending signals, Temu/AliExpress direct-factory patterns, and Alibaba wholesale supplier directories).
- **Web Crawling & Discovery Conventions**: Standard web scraping resilience, query formulation, and citation rules.
- **Initial Location**: Originally scaffolded in `backend/skills/`, then moved into `backend/agent/aimarketresearch/skills/` to isolate market-research-specific agent assets.

---

## 2. Consolidation & Merges (From 33 to 28 Skills)

To eliminate prompt fragmentation and redundant token costs, 9 overlapping micro-skills were merged into 4 unified, high-signal skills:

| New Merged Skill | Original (OG) Skills Merged | What Was Combined |
| :--- | :--- | :--- |
| **`profitability-and-margin-analysis`** | `cost-and-margin-analysis`<br>`profitability-analysis` | Combined the landed cost stack formulas (product cost, freight, marketplace fees, marketing, returns) with profit margin sensitivity scenarios (±20% cost, -10% price). |
| **`product-opportunity-scoring`** | `product-scoring`<br>`product-opportunities` | Combined the 0–100 weighted rubric (demand 30%, competition 25%, margin 25%, trend 20%) with candidate ranking and human-readable justification generation. |
| **`supplier-research-and-verification`** | `wholesale-supplier-research`<br>`supplier-verification` | Combined wholesale directory search (Alibaba, Made-in-China, 1688, MOQ, lead times) with factory legitimacy screening, cert auditing (ISO, CE), and red flag checks. |
| **`data-validation-and-hygiene`** | `source-validation`<br>`research-freshness`<br>`research-deduplication` | Combined authentic URL verification, timestamp/freshness volatility auditing (24h volatile vs 7–30d stable), and cross-marketplace duplicate/twin listing matching. |

---

## 3. Current Active Skills by Stage (28 Total)

### Stage 1: Pipeline Orchestration & API Resilience (`orchestration`)

1. `marketplace-research-orchestration`
2. `structured-research-output`
3. `research-quality-control`

### Stage 2: Web Search & Source Discovery (`discovery`)

4. `web-search-strategy`
2. `deep-web-research`
3. `browser-navigation`
4. `web-crawling`
5. `dynamic-page-extraction`
6. `web-data-extraction`
7. `data-validation-and-hygiene` *(merged)*

### Stage 3: Marketplace & Supplier Intelligence (`marketplace`)
 1. `amazon-product-research`
 2. `walmart-product-research`
 3. `bestbuy-product-research`
 4. `ebay-product-research`
 5. `tiktok-shop-product-research`
 6. `temu-product-research`
 7. `aliexpress-product-research`
 8. `supplier-research-and-verification` *(merged)*

### Stage 4: Financial, Competitive & Sentiment Analysis (`analysis`)
 1. `market-analysis`
 2. `competitor-analysis`
 3. `review-analysis`
 4. `keyword-demand-analysis`
 5. `sales-estimation`
 6. `profitability-and-margin-analysis` *(merged)*
 7. `product-opportunity-scoring` *(merged)*
 8. `evidence-and-citation-management`

### Stage 5: Reporting, Synthesis & Data Export (`reporting`)
 1. `research-report`
 2. `excel-product-export`
