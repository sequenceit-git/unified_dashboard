/**
 * AI Market Research Agent
 *
 * Uses the OpenAI Responses API (SDK v7) with the native `web_search_preview`
 * tool to research products across multiple marketplaces and generate three
 * structured outputs:
 *   1. MarketplaceResearch  — raw product-level data with source URLs
 *   2. ProductRecommendation — ranked opportunity list (up to 30)
 *   3. MarketAnalysis        — market trends, competition, profitability
 *
 * Runtime: Node.js (CommonJS). No third-party crawlers. No marketplace APIs.
 * All web access goes through OpenAI native web search.
 */

const OpenAI = require('openai')
const { z } = require('zod')

const ResearchReport = require('../../models/ResearchReport')
const MarketplaceResearch = require('../../models/MarketplaceResearch')
const ProductRecommendation = require('../../models/ProductRecommendation')
const MarketAnalysis = require('../../models/MarketAnalysis')
const { skillManager } = require('./skills/index')
const { withRetry } = require('../../utils/retry')

// ─── OpenAI client ────────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API })

// ─── Zod schemas for structured output validation ─────────────────────────────

const MarketplaceProductSchema = z.object({
  productName: z.string(),
  marketplace: z.string(),
  productUrl: z.string().url(),
  price: z.number().nullable().optional(),
  currency: z.string().default('USD'),
  estimatedMonthlySales: z.number().nullable().optional(),
  salesDataType: z.enum(['actual', 'estimated', 'unavailable']).default('unavailable'),
  searchRanking: z.number().nullable().optional(),
  rankingKeyword: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().nullable().optional(),
  reviewSummary: z
    .object({
      positive: z.array(z.string()).default([]),
      negative: z.array(z.string()).default([]),
    })
    .default({ positive: [], negative: [] }),
  sourceUrl: z.string().nullable().optional(),
})

const ProductRecommendationSchema = z.object({
  rank: z.number().int().min(1),
  productName: z.string(),
  category: z.string(),
  marketplace: z.string(),
  productUrl: z.string().url(),
  price: z.number().nullable().optional(),
  currency: z.string().default('USD'),
  estimatedMonthlySales: z.number().nullable().optional(),
  estimatedMonthlyRevenue: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().nullable().optional(),
  competitionLevel: z.enum(['Low', 'Medium', 'High', 'Unknown']).default('Unknown'),
  estimatedProfitMarginPercent: z.number().nullable().optional(),
  opportunityScore: z.number().min(0).max(100).nullable().optional(),
  recommendationReason: z.string(),
})

const MarketAnalysisSchema = z.object({
  marketOverview: z.object({
    summary: z.string(),
    demandLevel: z.enum(['Low', 'Medium', 'High', 'Unknown']).default('Unknown'),
    competitionLevel: z.enum(['Low', 'Medium', 'High', 'Unknown']).default('Unknown'),
    marketOutlook: z.string().nullable().optional(),
  }),
  trends: z.array(
    z.object({
      name: z.string(),
      direction: z.enum(['Growing', 'Stable', 'Declining', 'Uncertain']).optional(),
      evidence: z.string().nullable().optional(),
      sourceUrls: z.array(z.string()).default([]),
      confidence: z.enum(['Low', 'Medium', 'High']).optional(),
    }),
  ).default([]),
  profitAnalysis: z.array(
    z.object({
      category: z.string(),
      productName: z.string().nullable().optional(),
      currency: z.string().default('USD'),
      estimatedSellingPrice: z.number().nullable().optional(),
      estimatedProductCost: z.number().nullable().optional(),
      estimatedShippingCost: z.number().nullable().optional(),
      estimatedMarketplaceFees: z.number().nullable().optional(),
      estimatedMarketingCost: z.number().nullable().optional(),
      estimatedOtherCosts: z.number().nullable().optional(),
      estimatedProfitPerUnit: z.number().nullable().optional(),
      estimatedProfitMarginPercent: z.number().nullable().optional(),
      assumptions: z.array(z.string()).default([]),
    }),
  ).default([]),
  opportunities: z.array(
    z.object({
      productName: z.string(),
      category: z.string(),
      opportunityScore: z.number().min(0).max(100).optional(),
      demandScore: z.number().min(0).max(100).optional(),
      competitionScore: z.number().min(0).max(100).optional(),
      profitabilityScore: z.number().min(0).max(100).optional(),
      trendScore: z.number().min(0).max(100).optional(),
      reason: z.string(),
      sourceUrls: z.array(z.string()).default([]),
    }),
  ).default([]),
  risks: z.array(z.string()).default([]),
  conclusion: z.string().nullable().optional(),
})

const AgentOutputSchema = z.object({
  marketplaceProducts: z.array(MarketplaceProductSchema),
  productRecommendations: z.array(ProductRecommendationSchema).max(30),
  marketAnalysis: MarketAnalysisSchema,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the system prompt for the market research agent.
 * Loads skill instructions from the skill library for relevant stages.
 */
function buildSystemPrompt(categories, niche, instructions) {
  // Load skills for the stages we inject into the system prompt
  const orchSkills = skillManager.loadStageInstructions('orchestration')
  const discoverySkills = skillManager.loadStageInstructions('discovery')
  const marketplaceSkills = skillManager.loadStageInstructions('marketplace')
  const analysisSkills = skillManager.loadStageInstructions('analysis')
  const reportingSkills = skillManager.loadStageInstructions('reporting')

  const formatSkills = (skills) =>
    skills
      .filter((s) => !s.error)
      .map((s) => `### Skill: ${s.skillName}\n${s.content}`)
      .join('\n\n---\n\n')

  return `You are an expert AI Market Research Agent for an e-commerce business intelligence platform.

## Your Mission
Research product opportunities across multiple online marketplaces and generate a complete, evidence-based market research report.

## Research Parameters
- **Categories to research:** ${categories.join(', ')}
${niche ? `- **Product niche / focus:** ${niche}` : ''}
${instructions ? `- **Additional instructions:** ${instructions}` : ''}
- **Target marketplaces:** Amazon, Walmart, Best Buy, eBay, TikTok Shop, Temu, AliExpress, and wholesale/supplier sites where relevant
- **Products to find:** Up to 30 real product listings with direct URLs

## Core Rules
1. **Real URLs only** — Every product listing must include a direct, specific product URL. Do NOT use marketplace homepages or generic search URLs.
2. **Honest uncertainty** — If a metric (e.g. monthly sales volume) cannot be reliably obtained, set it to null and note salesDataType as "unavailable". Never invent numbers.
3. **Source tracking** — Preserve source URLs for all factual claims, trends, and evidence.
4. **Multi-category** — Research ALL requested categories. Do not focus on only one.
5. **Deduplication** — If you find the same product on multiple searches, keep only the best record with the direct URL.
6. **Evidence-based scoring** — Opportunity scores and profit estimates must be grounded in observed prices, review counts, and competitor data.
7. **Rate limit awareness** — Pace your web searches. Do not fire dozens of searches simultaneously.

## Pipeline Stages

### STAGE 1 — ORCHESTRATION
${formatSkills(orchSkills)}

### STAGE 2 — DISCOVERY
${formatSkills(discoverySkills)}

### STAGE 3 — MARKETPLACE INTELLIGENCE
${formatSkills(marketplaceSkills)}

### STAGE 4 — ANALYSIS
${formatSkills(analysisSkills)}

### STAGE 5 — REPORTING
${formatSkills(reportingSkills)}

## Output Format
You MUST return a single valid JSON object matching this exact structure. Do not wrap it in markdown code blocks.

{
  "marketplaceProducts": [
    {
      "productName": "string",
      "marketplace": "amazon|walmart|bestbuy|ebay|tiktok_shop|temu|aliexpress|wholesale|other",
      "productUrl": "https://...",   // REQUIRED — direct product listing URL
      "price": number | null,
      "currency": "USD",
      "estimatedMonthlySales": number | null,
      "salesDataType": "actual|estimated|unavailable",
      "searchRanking": number | null,
      "rankingKeyword": "string | null",
      "rating": number | null,
      "reviewCount": number | null,
      "reviewSummary": { "positive": ["..."], "negative": ["..."] },
      "sourceUrl": "https://..."     // search result or page URL
    }
  ],
  "productRecommendations": [        // max 30, sorted by opportunityScore DESC
    {
      "rank": 1,
      "productName": "string",
      "category": "string",
      "marketplace": "string",
      "productUrl": "https://...",   // REQUIRED direct product URL
      "price": number | null,
      "currency": "USD",
      "estimatedMonthlySales": number | null,
      "estimatedMonthlyRevenue": number | null,
      "rating": number | null,
      "reviewCount": number | null,
      "competitionLevel": "Low|Medium|High|Unknown",
      "estimatedProfitMarginPercent": number | null,
      "opportunityScore": number (0-100),
      "recommendationReason": "string — explain why this product scores well, citing evidence"
    }
  ],
  "marketAnalysis": {
    "marketOverview": {
      "summary": "string",
      "demandLevel": "Low|Medium|High|Unknown",
      "competitionLevel": "Low|Medium|High|Unknown",
      "marketOutlook": "string | null"
    },
    "trends": [
      {
        "name": "string",
        "direction": "Growing|Stable|Declining|Uncertain",
        "evidence": "string | null",
        "sourceUrls": ["https://..."],
        "confidence": "Low|Medium|High"
      }
    ],
    "profitAnalysis": [
      {
        "category": "string",
        "productName": "string | null",
        "currency": "USD",
        "estimatedSellingPrice": number | null,
        "estimatedProductCost": number | null,
        "estimatedShippingCost": number | null,
        "estimatedMarketplaceFees": number | null,
        "estimatedMarketingCost": number | null,
        "estimatedOtherCosts": number | null,
        "estimatedProfitPerUnit": number | null,
        "estimatedProfitMarginPercent": number | null,
        "assumptions": ["string"]
      }
    ],
    "opportunities": [
      {
        "productName": "string",
        "category": "string",
        "opportunityScore": number (0-100),
        "demandScore": number (0-100),
        "competitionScore": number (0-100),
        "profitabilityScore": number (0-100),
        "trendScore": number (0-100),
        "reason": "string",
        "sourceUrls": ["https://..."]
      }
    ],
    "risks": ["string"],
    "conclusion": "string | null"
  }
}`
}

/**
 * Run the OpenAI Responses API call with web_search_preview tool enabled.
 * Uses structured JSON output request.
 */
async function callOpenAIResearchAgent(systemPrompt, userPrompt) {
  const response = await withRetry(
    () =>
      openai.responses.create({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        tool_choice: 'auto',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      maxDelayMs: 60000,
    },
  )

  // Extract text output from the Responses API shape
  const outputText =
    response.output_text ||
    response.output?.find?.((b) => b.type === 'text')?.text ||
    ''

  if (!outputText) {
    throw new Error('OpenAI agent returned no text output')
  }

  return outputText
}

/**
 * Parse and validate the agent JSON output against our Zod schema.
 * Returns validated data or throws with a descriptive error.
 */
function parseAndValidateOutput(rawText) {
  let parsed
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`Agent output is not valid JSON: ${err.message}`)
  }

  const result = AgentOutputSchema.safeParse(parsed)
  if (!result.success) {
    // Log validation issues but be lenient — return what we can
    console.warn('[agent] Output validation warnings:', result.error.flatten())
    // Return the raw parsed data even if partially invalid
    return parsed
  }

  return result.data
}

/**
 * Deduplicate marketplace products by (productUrl, marketplace).
 * Keeps the record with the most complete data.
 */
function deduplicateProducts(products) {
  const seen = new Map()
  for (const p of products) {
    const key = `${p.marketplace}::${p.productUrl}`
    if (!seen.has(key)) {
      seen.set(key, p)
    } else {
      // Prefer the version with more non-null fields
      const existing = seen.get(key)
      const existingScore = Object.values(existing).filter((v) => v !== null && v !== undefined).length
      const newScore = Object.values(p).filter((v) => v !== null && v !== undefined).length
      if (newScore > existingScore) seen.set(key, p)
    }
  }
  return Array.from(seen.values())
}

// ─── Main Agent Function ──────────────────────────────────────────────────────

/**
 * Run the full market research pipeline for a set of categories.
 *
 * @param {object} params
 * @param {string[]} params.categories    - e.g. ['Home & Kitchen', 'Electronics']
 * @param {string}   params.niche         - optional product niche / focus keyword
 * @param {string}   params.instructions  - optional free-form instructions
 * @param {string}   params.reportId      - MongoDB ObjectId string for the parent ResearchReport
 * @param {object}   params.user          - req.user object (for audit)
 */
async function runMarketResearch({ categories, niche, instructions, reportId, user }) {
  const startedAt = new Date()

  // Mark report as running
  await ResearchReport.findByIdAndUpdate(reportId, {
    status: 'running',
    startedAt,
  })

  try {
    console.log(`[agent] Starting market research for categories: ${categories.join(', ')}`)

    // ── Build prompts ──────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(categories, niche, instructions)

    const userPrompt = `Please conduct a comprehensive market research study for the following:

**Product Categories:** ${categories.join(', ')}
${niche ? `**Specific Niche/Focus:** ${niche}` : ''}
${instructions ? `**Additional Instructions:** ${instructions}` : ''}

Research workflow:
1. Plan targeted web searches for each category across all major marketplaces (Amazon, Walmart, Best Buy, eBay, TikTok Shop, Temu, AliExpress, wholesale suppliers).
2. Execute searches and collect real product listings with direct URLs, prices, ratings, and review counts.
3. For each marketplace, identify the top-selling or trending products.
4. Collect evidence on search rankings, customer sentiment, and competitive density.
5. Analyze market trends, demand signals, and profitability for each category.
6. Identify and score the top product opportunities (up to 30 total across all categories).
7. Generate the complete structured JSON output as specified in your instructions.

Important: Every product in marketplaceProducts and productRecommendations MUST have a real, direct product listing URL — not a search page or homepage.`

    // ── Call OpenAI ────────────────────────────────────────────────────────
    console.log('[agent] Calling OpenAI Responses API with web_search_preview...')
    const rawOutput = await callOpenAIResearchAgent(systemPrompt, userPrompt)

    // ── Parse & validate ───────────────────────────────────────────────────
    console.log('[agent] Parsing and validating agent output...')
    const agentData = parseAndValidateOutput(rawOutput)

    const {
      marketplaceProducts = [],
      productRecommendations = [],
      marketAnalysis = {},
    } = agentData

    // ── Deduplicate products ───────────────────────────────────────────────
    const dedupedProducts = deduplicateProducts(marketplaceProducts)
    console.log(
      `[agent] Found ${dedupedProducts.length} unique products (from ${marketplaceProducts.length} raw)`,
    )

    // ── Persist MarketplaceResearch records ───────────────────────────────
    const savedProducts = []
    for (const product of dedupedProducts) {
      try {
        const doc = await MarketplaceResearch.create({
          reportId,
          categories,
          productName: product.productName,
          marketplace: product.marketplace,
          productUrl: product.productUrl,
          price: product.price ?? null,
          currency: product.currency || 'USD',
          estimatedMonthlySales: product.estimatedMonthlySales ?? null,
          salesDataType: product.salesDataType || 'unavailable',
          searchRanking: product.searchRanking ?? null,
          rankingKeyword: product.rankingKeyword ?? null,
          rating: product.rating ?? null,
          reviewCount: product.reviewCount ?? null,
          reviewSummary: product.reviewSummary || { positive: [], negative: [] },
          sourceUrl: product.sourceUrl ?? null,
          dataCollectedAt: new Date(),
        })
        savedProducts.push(doc)
      } catch (err) {
        console.warn(`[agent] Failed to save product "${product.productName}": ${err.message}`)
      }
    }
    console.log(`[agent] Saved ${savedProducts.length} marketplace research records`)

    // ── Persist ProductRecommendation records ─────────────────────────────
    const savedRecs = []
    for (const rec of productRecommendations.slice(0, 30)) {
      try {
        const doc = await ProductRecommendation.create({
          reportId,
          categories,
          rank: rec.rank,
          productName: rec.productName,
          category: rec.category,
          marketplace: rec.marketplace,
          productUrl: rec.productUrl,
          price: rec.price ?? null,
          currency: rec.currency || 'USD',
          estimatedMonthlySales: rec.estimatedMonthlySales ?? null,
          estimatedMonthlyRevenue: rec.estimatedMonthlyRevenue ?? null,
          rating: rec.rating ?? null,
          reviewCount: rec.reviewCount ?? null,
          competitionLevel: rec.competitionLevel || 'Unknown',
          estimatedProfitMarginPercent: rec.estimatedProfitMarginPercent ?? null,
          opportunityScore: rec.opportunityScore ?? null,
          recommendationReason: rec.recommendationReason,
        })
        savedRecs.push(doc)
      } catch (err) {
        console.warn(`[agent] Failed to save recommendation "${rec.productName}": ${err.message}`)
      }
    }
    console.log(`[agent] Saved ${savedRecs.length} product recommendations`)

    // ── Persist MarketAnalysis ─────────────────────────────────────────────
    let savedAnalysis = null
    try {
      savedAnalysis = await MarketAnalysis.create({
        reportId,
        categories,
        marketOverview: marketAnalysis.marketOverview || {
          summary: 'Analysis not available',
          demandLevel: 'Unknown',
          competitionLevel: 'Unknown',
        },
        trends: marketAnalysis.trends || [],
        profitAnalysis: marketAnalysis.profitAnalysis || [],
        opportunities: marketAnalysis.opportunities || [],
        risks: marketAnalysis.risks || [],
        conclusion: marketAnalysis.conclusion ?? null,
      })
      console.log('[agent] Saved market analysis')
    } catch (err) {
      console.warn(`[agent] Failed to save market analysis: ${err.message}`)
    }

    // ── Build summary ──────────────────────────────────────────────────────
    const topRec = savedRecs[0]
    const summary =
      `AI research completed for ${categories.join(', ')}` +
      (niche ? ` (${niche})` : '') +
      `: ${savedProducts.length} products collected, ${savedRecs.length} opportunities ranked.` +
      (topRec
        ? ` Top pick: "${topRec.productName}" on ${topRec.marketplace} — score ${topRec.opportunityScore ?? 'N/A'}/100.`
        : '')

    // ── Update ResearchReport to completed ─────────────────────────────────
    const finishedAt = new Date()
    await ResearchReport.findByIdAndUpdate(reportId, {
      status: 'completed',
      summary,
      finishedAt,
    })

    console.log(`[agent] Research pipeline completed in ${Math.round((finishedAt - startedAt) / 1000)}s`)

    return {
      reportId,
      summary,
      productsCollected: savedProducts.length,
      recommendationsGenerated: savedRecs.length,
      analysisCreated: !!savedAnalysis,
    }
  } catch (err) {
    console.error('[agent] Research pipeline failed:', err.message)

    // Mark report as failed
    await ResearchReport.findByIdAndUpdate(reportId, {
      status: 'failed',
      error: err.message,
      finishedAt: new Date(),
    })

    throw err
  }
}

module.exports = { runMarketResearch }
