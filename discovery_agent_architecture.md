# Discovery Agent Two — Loop Agent Architecture & Workflow

Comprehensive end-to-end technical documentation of the Discovery Agent Two workflow, from the moment a user clicks **"Start Research"** in the UI to the final rendered opportunity cards and catalog integration.

---

## 1. Architectural Overview & Design Principles

Discovery Agent Two implements an **asynchronous, multi-stage agentic loop** powered by OpenAI's **Responses API with Live Web Search** and deterministic Node.js business logic.

```
[ User in Frontend UI ]
         │ (POST /api/research/generate)
         ▼
[ Express Router: research.js ] ──► (Creates queued ResearchReport2 document)
         │
         ├──► Immediate HTTP 202 Accepted response to UI (triggers live polling)
         ▼
[ Asynchronous Worker Loop: discoveryAgentTwo.js ]
         │
         ├──► STAGE 1: Live Discovery across Target Marketplaces (Amazon, Walmart, eBay, Temu)
         │
         ├──► STAGE 2: Sequential Deep-Dive Loop (1 Candidate at a time)
         │       ├── 2A: Cross-Market Demand & Sentiment Validation (eBay + other platforms)
         │       ├── 2B: Wholesale Sourcing Search (Alibaba, AliExpress, US Suppliers)
         │       ├── 2C: Deterministic Landed Unit Economics in Node.js
         │       ├── 2D: Minimum Net Margin Filtering (≥ user min threshold)
         │       ├── 2E: Deterministic 0-100 Opportunity Scoring & Confidence in Node.js
         │       ├── 2F: Factual AI Notes Synthesis
         │       └── 2G: Incremental Database Persistence (Resilient to crashes)
         │
         └──► STAGE 3: Final Ranking, Summarization & Completion
                 │
                 ▼
[ MongoDB: ResearchReport2 (status: 'completed', reportDate: 'YYYY-MM-DD') ]
         │
         ▼
[ Frontend Poller: ProductDiscovery2Page.jsx ] ──► Auto-loads fresh cards into <OpportunityCard2 />
```

---

## 2. Step-by-Step Workflow Execution

### Step 1: User Launches Research (Frontend UI)

1. **Modal Trigger**: The user opens the modal on the **Product Discovery 2** page.
2. **User Inputs**:
   - **Target Categories**: One or more product categories (e.g., `Home & Kitchen`, `Electronics`).
   - **Product Niche** *(optional)*: Specific search focus (e.g., `ergonomic desk accessories`).
   - **Target Marketplaces**: Where the client resells (`eBay` checked by default, plus `TikTok Shop` and/or `Temu`).
   - **Minimum Net Profit Margin (%)**: Numeric threshold (default `15%`).
   - **Custom Instructions** *(optional)*: Freeform guidance for the agent.
3. **Dispatch**: Clicking **"Start Research"** sends a `POST /api/research/generate` request.

---

### Step 2: Route Ingestion, Guardrails & Async Queue (`backend/routes/research/research.js`)

1. **Concurrency Lock**: Checks if another research run is currently `queued` or `running`. If so, rejects with `HTTP 409 Conflict` to prevent duplicate parallel runs and excess API costs.
2. **Initial Database Record**: Creates a new record in `ResearchReport2`:
   - `status: 'queued'`
   - `reportDate: null` *(deferred until completed)*
   - `params`: stores categories, niche, target marketplaces, instructions, and `minMargin`.
3. **HTTP 202 Accepted**: Immediately returns the report ID and initial status to the frontend so the client never waits on a blocking HTTP request.
4. **Dispatches Background Runner**: Launches `runDiscoveryAgentTwo(...)` inside `setImmediate()`.

---

### Step 3: Frontend Polling & Live Progress Bar (`ProductDiscovery2Page.jsx` & `AgentProgressBar.jsx`)

1. **Dynamic Poller**: Polls `GET /api/research/status/:id` every 2.5 seconds.
2. **Real-Time Visuals**:
   - Renders `<AgentProgressBar />` showing the active stage, percentage, item counter (`Evaluating (Item X of Total)`), and current product title being analyzed.
   - Shows empty/processing state explaining that the agent is actively discovering opportunities.

---

### Step 4: Stage 1 — Live Marketplace Discovery (`discoverCandidates`)

1. **Engine**: Calls OpenAI Responses API (`client.responses.create`) with `tools: [{ type: 'web_search', filters: { allowed_domains: ['ebay.com', 'amazon.com', 'walmart.com', 'temu.com', 'tiktok.com'] } }]`.
2. **Skill Loaded**: Injects `product-discovery-search/SKILL.md`.
3. **Process**:
   - Searches real live US marketplace listings for high-velocity, trending products matching the requested categories and niche.
   - Prohibits fabricated prices or fake URLs.
4. **Output**: Returns a list of 10–15 candidate products with real observed listing titles, prices, and URLs.
5. **Progress Update**: Updates report progress to `20%` in MongoDB.

---

### Step 5: Stage 2 — Sequential Deep-Dive Loop (1 Item per Iteration)

To avoid massive prompt context limits, hallucinations, and catastrophic errors, candidates are analyzed **sequentially, one item at a time**:

#### 2A: Cross-Market Demand & Sentiment Validation (`validateProductDemand`)

- Injects `cross-market-validation/SKILL.md`.
- Searches `ebay.com` for exact/equivalent listings, active competitor counts, and median sold prices.
- Cross-references on `amazon.com` or `walmart.com` to inspect true review volumes, ratings, and common customer complaints.
- Establishes `demandTier` (`High`, `Medium`, `Low`, `Unknown`) and assesses live market traction.

#### 2B: Live Wholesale Sourcing Search (`findBuySources`)

- Injects `sourcing-and-unit-economics/SKILL.md`.
- Searches `alibaba.com`, domestic US wholesalers, or `aliexpress.com` for real inventory purchase sources.
- Extracts unit cost, MOQ, ship-from country, and estimated delivery days.

#### 2C: Deterministic Unit Economics in Node.js (`calculateUnitEconomics`)

- **No LLM Math**: All financial math is executed in pure JavaScript inside `economics.js`.
- **Channel Fees**:
  - **eBay**: 13.6% referral fee + fixed transaction fee ($0.30 or $0.40).
  - **TikTok Shop**: 8% referral fee + $0.30.
  - **Other**: 15% standard fee.
- **Import Duties**: Automatically adds estimated import duty (10%) if sourcing ship-from country is non-US.
- **Landed Cost & Net Margin**:
  $$\text{Landed Cost} = \text{Unit Cost} + \text{Shipping} + \text{Duty}$$
  $$\text{Net Profit} = \text{Selling Price} - \text{Landed Cost} - \text{Channel Fee}$$
  $$\text{Net Margin \%} = \left(\frac{\text{Net Profit}}{\text{Selling Price}}\right) \times 100$$

#### 2D: Minimum Profit Margin Gate

- Compares the calculated net margin against `minMarginThreshold` (e.g. 15% or 20%).
- If the item fails to meet the threshold, it is skipped and excluded from final recommendations.

#### 2E: Deterministic Opportunity Scoring (`computeOpportunityScore`)

- 0–100 score computed deterministically in Node.js based on:
  - **Profit Margin** (max 35 points)
  - **Demand Tier** (max 25 points)
  - **Rating & Sentiment** (max 15 points)
  - **Competition on Channel** (max 15 points)
  - **Sourcing Reliability & Speed** (max 10 points)
- Computes data confidence level (`high`, `medium`, `low`, or `unverified`).

#### 2F: AI Notes Synthesis (`generateAiNotes`)

- Model receives only the verified factual numbers extracted above.
- Writes 1–2 factual sentences stating the single strongest reason to sell and biggest risk factor.

#### 2G: Incremental Database Write

- Persists the validated product into `ResearchReport2.opportunities` immediately.
- If the server or network hiccups on item #12, items #1 through #11 are preserved.

---

### Step 6: Stage 3 — Ranking & Report Finalization

1. **Sorting**: Sorts all passing opportunities in descending order by `opportunityScore`.
2. **Top Opportunities**: Extracts the top 10 to 20 opportunities and assigns sequential ranks (1 to 20).
3. **Date-Wise Clustering**: Sets `reportDate` to the exact completion date (`YYYY-MM-DD`).
4. **Final DB Update**: Sets `status: 'completed'`, logs `finishedAt`, generates a concise summary narrative, and sets `progress.percent = 100`.

---

### Step 7: Frontend UI Refresh & Opportunity Cards

1. Poller detects `status: 'completed'`.
2. Automatically triggers `GET /api/research/recommendations/:reportId`.
3. Renders the products as interactive `<OpportunityCard2 />` cards displaying:
   - Rank and target selling channel
   - 0–100 Opportunity Score badge
   - Selling Price, Cost, and Net Margin %
   - **Est. Monthly Units** (real marketplace sales badges)
   - Competition level and review star ratings
   - AI Agent Rationale
   - Clickable source supplier link (Alibaba / supplier buy link)

---

### Step 8: Actionable Next Steps ("Add to Catalog" & Exports)

1. **Download Options**:
   - **CSV**: Sanitized against spreadsheet formula injection (`=`, `+`, `-`, `@`).
   - **Excel (.xlsx)**: Formatted table with margins, costs, and buy links.
2. **Add to Catalog**:
   - Clicking **"Add to Catalog"** calls `POST /api/research/add-to-catalog`.
   - Creates a product in `Product.js` with `status: 'draft'`, `stock: 0`, and a unique collision-resistant SKU (`BOT-<CAT>-<timestamp><random5>`).
   - Links `addedProductId` back into `ResearchReport2`, turning the card button into a disabled green checkmark (`Added to Catalog`).
   - The imported product is immediately accessible and filterable under the **AI Agent (Bot)** source filter on the main Products Catalog page.
