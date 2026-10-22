/**
 * Product Discovery 2 Agent (DiscoveryAgentTwo)
 *
 * Implements Live Web Search via OpenAI Responses API,
 * 3-Stage Agentic Loop with per-product sequential pipeline,
 * and deterministic landed unit economics & scoring in Node.js.
 */

const OpenAI = require('openai')
const ResearchReport2 = require('../../models/ResearchReport2')
const { skillManager } = require('./skills/index')
const { calculateUnitEconomics, computeOpportunityScore } = require('./economics')

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set OPENAI_API or OPENAI_API_KEY.')
  }
  return new OpenAI({ apiKey })
}

/**
 * Sleep helper for exponential backoff
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Extract clean JSON from OpenAI response text with truncated stream repair
 */
function parseJsonSafe(text) {
  if (!text || typeof text !== 'string') return null
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()

  // 1. Direct standard parse
  try {
    return JSON.parse(cleaned)
  } catch (_) {}

  // 2. Full bracket/brace match
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (match) {
    try {
      return JSON.parse(match[0])
    } catch (_) {}
  }

  // 3. Truncated stream repair: if tokens ended mid-array or mid-object
  const lastObjectEnd = cleaned.lastIndexOf('}')
  if (lastObjectEnd !== -1) {
    const candidateSub = cleaned.slice(0, lastObjectEnd + 1).trim()
    // Try closing an array within an object: `]}`
    try {
      const repairedObj = JSON.parse(candidateSub + ']}')
      if (repairedObj?.candidates?.length || Array.isArray(repairedObj)) return repairedObj
    } catch (_) {}

    // Try closing a top-level array: `]`
    try {
      const repairedArr = JSON.parse(candidateSub + ']')
      if (Array.isArray(repairedArr) && repairedArr.length) return repairedArr
    } catch (_) {}

    // Try closing a single object: `}`
    try {
      const repairedSingle = JSON.parse(candidateSub)
      if (repairedSingle && typeof repairedSingle === 'object') return repairedSingle
    } catch (_) {}
  }

  return null
}

/**
 * Robust web search helper using client.responses.create with exponential retry & model fallback
 */
async function callWebSearch({ client, prompt, allowedDomains = [], maxRetries = 2 }) {
  const primaryModel = process.env.OPENAI_MODEL || 'gpt-5-mini'
  const fallbackModel = 'gpt-4o-mini'

  const tools = [{ type: 'web_search' }]
  if (Array.isArray(allowedDomains) && allowedDomains.length > 0) {
    tools[0].filters = { allowed_domains: allowedDomains }
  }

  let attempt = 0
  let currentModel = primaryModel

  while (attempt <= maxRetries) {
    try {
      const response = await client.responses.create({
        model: currentModel,
        tools,
        input: prompt,
      })

      return response.output_text || ''
    } catch (err) {
      attempt++
      const isRateLimit = err?.status === 429 || err?.message?.includes('rate_limit')
      const isServerOverload = err?.status >= 500 && err?.status < 600
      const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(err?.code)
      const isModelNotFound = err?.status === 404 || err?.message?.includes('model')

      if (isModelNotFound && currentModel !== fallbackModel) {
        console.warn(`[DiscoveryAgent] Model ${currentModel} unavailable. Switching to fallback: ${fallbackModel}`)
        currentModel = fallbackModel
        continue
      }

      if (attempt > maxRetries || (!isRateLimit && !isServerOverload && !isNetworkError)) {
        console.error(`[DiscoveryAgent] callWebSearch fatal error (attempt ${attempt}/${maxRetries}):`, err.message)
        throw err
      }

      const waitMs = attempt * 2000 + Math.floor(Math.random() * 500)
      console.warn(`[DiscoveryAgent] Transient error (${err.message}). Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`)
      await delay(waitMs)
    }
  }

  return ''
}

/**
 * Stage 1: Discover candidate products from target marketplaces using live Web Search
 */
async function discoverCandidates({ client, categories, niche, marketplaces = ['ebay', 'amazon', 'walmart', 'temu'] }) {
  const skillPrompt = skillManager.loadSkill('product-discovery-search') || ''
  const currentYear = new Date().getFullYear()

  const allowedDomains = [
    'ebay.com',
    'amazon.com',
    'walmart.com',
    'temu.com',
    'tiktok.com',
  ]

  const prompt = `You are an elite E-Commerce Product Discovery Agent with live web search capabilities.
${skillPrompt}

TASK:
Search live US marketplaces (${marketplaces.join(', ')}) to find in-demand, trending candidate products.
Target Category: "${categories.join(', ')}".
${niche ? `Niche Focus: "${niche}".` : ''}
Current Year: ${currentYear}.

RULES:
1. Search real product listings on allowed domains: ${allowedDomains.join(', ')}.
2. Do not fabricate or estimate prices. If not observable, set observedPriceUsd to null.
3. Every URL must be a real page you visited or searched. Never use placeholders.

Return ONLY a valid JSON object matching this schema:
{
  "candidates": [
    {
      "title": "string (specific product title)",
      "brand": "string or null",
      "observedMarketplace": "ebay" | "amazon" | "walmart" | "temu" | "tiktok_shop",
      "listingUrl": "string (valid URL)",
      "observedPriceUsd": number or null,
      "demandSignalText": "string or null",
      "reviewCount": number or null,
      "rating": number or null,
      "category": "string"
    }
  ]
}

Find 10 to 15 distinct, trending candidate products now.`

  const rawText = await callWebSearch({ client, prompt, allowedDomains })
  const parsed = parseJsonSafe(rawText)
  const list = parsed?.candidates || (Array.isArray(parsed) ? parsed : [])
  return Array.isArray(list) ? list : []
}

/**
 * Stage 2A: Validate Demand and Competition on eBay & across other major retail platforms (Amazon, Walmart, TikTok Shop, Temu)
 */
async function validateProductDemand({ client, candidate, targetMarketplaces = ['ebay'] }) {
  const skillPrompt = skillManager.loadSkill('cross-market-validation') || ''
  // Broad multi-platform search across major US retail channels
  const allowedDomains = ['ebay.com', 'amazon.com', 'walmart.com', 'temu.com', 'tiktok.com']

  const prompt = `You are a precision Cross-Market Demand Validator with live web search.
${skillPrompt}

CANDIDATE TO VALIDATE:
Title: "${candidate.title}"
Category: "${candidate.category || ''}"
Observed Price: $${candidate.observedPriceUsd || 'unknown'}
Client Target Selling Marketplaces: ${targetMarketplaces.join(', ')}

TASK:
1. Search ebay.com for exact or equivalent listings. Record active listing count, median sold price, and sold counts if visible.
2. Cross-check against amazon.com, walmart.com, or temu.com to inspect overall market demand, ratings, and review volumes.
3. Set demandTier: "High" | "Medium" | "Low" | "Unknown".
4. Set demandEvidence: "measured" | "inferred".

Return ONLY a valid JSON object with:
{
  "matchConfidence": "exact" | "equivalent" | "similar",
  "ebayActiveListings": number or null,
  "ebayPriceLow": number or null,
  "ebayPriceMedian": number or null,
  "ebayPriceHigh": number or null,
  "ebaySoldCount": number or null,
  "ebaySourceUrl": "string or null",
  "otherMarketplace": "amazon" | "walmart" | "temu" | "tiktok_shop" | null,
  "otherRating": number or null,
  "otherReviewCount": number or null,
  "otherUrl": "string or null",
  "demandTier": "High" | "Medium" | "Low" | "Unknown",
  "demandEvidence": "measured" | "inferred",
  "competitionLevel": "Low" | "Medium" | "High"
}`

  const rawText = await callWebSearch({ client, prompt, allowedDomains })
  return parseJsonSafe(rawText) || {
    matchConfidence: 'unverified',
    demandTier: 'Unknown',
    competitionLevel: 'Medium',
    ebayPriceMedian: candidate.observedPriceUsd || null,
  }
}

/**
 * Stage 2B: Search live buy sources & suppliers (Alibaba, US Wholesalers, AliExpress, Temu)
 */
async function findBuySources({ client, candidate, validation }) {
  const skillPrompt = skillManager.loadSkill('sourcing-and-unit-economics') || ''
  const allowedDomains = ['alibaba.com', 'aliexpress.com', 'temu.com']

  const prompt = `You are a Wholesale Sourcing Specialist with live web search.
${skillPrompt}

PRODUCT TO SOURCE:
Title: "${candidate.title}"
Category: "${candidate.category || ''}"
Target Retail Price: $${validation.ebayPriceMedian || candidate.observedPriceUsd || 'unknown'}

TASK:
Search alibaba.com, domestic wholesalers, or suppliers to find inventory sourcing options.
Extract verified buy unit cost and the real buy URL.

HARD RULES:
- Never invent prices. If not visible, return null.
- Provide the real product buy URL.

Return ONLY a valid JSON object with:
{
  "buySources": [
    {
      "unitCostUsd": number or null,
      "buyUrl": "string (real verified URL)"
    }
  ]
}`

  const rawText = await callWebSearch({ client, prompt, allowedDomains })
  const parsed = parseJsonSafe(rawText)
  const sources = Array.isArray(parsed?.buySources) ? parsed.buySources : []
  return sources.length > 0 ? sources[0] : null
}

/**
 * Stage 2C: Generate concise factual AI Notes
 */
async function generateAiNotes({ client, candidate, validation, sourcing, economics, scoreData }) {
  const skillPrompt = skillManager.loadSkill('opportunity-scoring-rubric') || ''

  const prompt = `You are an E-Commerce Advisor synthesizing findings.
${skillPrompt}

FACTS:
Product: "${candidate.title}"
Target Selling Price: $${economics.sellingPrice || 'N/A'}
Landed Cost: $${economics.landedCost || 'N/A'}
Net Margin: ${economics.netMarginPct != null ? economics.netMarginPct + '%' : 'Unverified'}
Opportunity Score: ${scoreData.opportunityScore}/100 (${scoreData.confidence} confidence)
Demand Tier: ${validation.demandTier || 'Unknown'}
Sourcing Supplier: ${sourcing?.supplierName || 'Not found'} (${sourcing?.shipFromCountry || 'Unknown'})
Top Complaints: ${(validation.topComplaints || []).join(', ') || 'None reported'}

TASK:
Write 1-2 concise, factual sentences explaining the single strongest reason to sell/buy and the single biggest risk. Use ONLY extracted facts.`

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'
  try {
    const res = await client.responses.create({
      model,
      input: prompt,
    })
    return (res.output_text || '').trim()
  } catch {
    return `Discovered on ${candidate.observedMarketplace || 'market'} with estimated ${economics.netMarginPct || 0}% net profit margin.`
  }
}

/**
 * Main Agent Runner for Product Discovery
 */
async function runDiscoveryAgent({ categories = [], niche = '', instructions = '', minMargin: directMinMargin, marketplaces, reportId, user }) {
  console.log(`[DiscoveryAgent] Starting run for reportId: ${reportId}, categories: [${categories.join(', ')}]`)

  const client = getOpenAIClient()
  const minMarginThreshold = Number(directMinMargin) || 15
  console.log(`[DiscoveryAgent2] Active minimum margin filter: ${minMarginThreshold}%`)

  // Update report to running with initial progress
  await ResearchReport2.findByIdAndUpdate(reportId, {
    status: 'running',
    startedAt: new Date(),
    progress: {
      stage: 'Scanning Marketplaces',
      step: 1,
      totalSteps: 15,
      percent: 5,
      currentItem: `Initializing Web Search across ${categories.join(', ')}...`,
    },
  })

  try {
    // Stage 1: Live Web Search across target marketplaces
    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Scanning Marketplaces',
      'progress.percent': 10,
      'progress.currentItem': `Searching live listings on eBay, Amazon, Walmart & Temu...`,
    })

    const candidates = await discoverCandidates({
      client,
      categories,
      niche,
      marketplaces: marketplaces && marketplaces.length ? marketplaces : ['ebay', 'amazon', 'walmart', 'temu'],
    })

    console.log(`[DiscoveryAgent2] Discovered ${candidates.length} candidates via Web Search.`)

    if (!candidates.length) {
      throw new Error('No candidate products found via live web search. Please try another category or niche.')
    }

    const totalCandidates = candidates.length
    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Evaluating Products',
      'progress.totalSteps': totalCandidates,
      'progress.percent': 20,
      'progress.currentItem': `Discovered ${totalCandidates} items. Beginning deep-dive cross-market validation...`,
    })

    // Stage 2: Bounded Concurrent Deep-Dive Pipeline (concurrency: 2 with incremental DB writes)
    const evaluatedOpportunities = []
    const BATCH_SIZE = 2

    for (let i = 0; i < totalCandidates; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE)
      const stepNum = Math.min(i + batch.length, totalCandidates)
      const loopPercent = Math.min(85, Math.round(20 + ((stepNum / totalCandidates) * 65)))

      console.log(`[DiscoveryAgent2] Evaluating batch [${stepNum}/${totalCandidates}]: ${batch.map((c) => `"${c.title}"`).join(', ')}`)

      await ResearchReport2.findByIdAndUpdate(reportId, {
        'progress.stage': `Evaluating (${stepNum}/${totalCandidates})`,
        'progress.step': stepNum,
        'progress.totalSteps': totalCandidates,
        'progress.percent': loopPercent,
        'progress.currentItem': batch.map((c) => c.title).join(' | '),
      })

      const batchResults = await Promise.all(
        batch.map(async (candidate) => {
          try {
            // 2A: Validate Demand & Competition
            const validation = await validateProductDemand({
              client,
              candidate,
              targetMarketplaces: marketplaces && marketplaces.length ? marketplaces : ['ebay'],
            })

            // 2B: Find Real Sourcing Buy Link
            const sourcing = await findBuySources({ client, candidate, validation })

            // 2C: Deterministic Unit Economics in Node.js
            const sellingPrice = validation.ebayPriceMedian || candidate.observedPriceUsd || null
            const unitCost = sourcing?.unitCostUsd || null
            const shippingCost = sourcing?.shippingCostPerUnitUsd || 0
            const dutyApplies = sourcing?.shipFromCountry && sourcing.shipFromCountry.toUpperCase() !== 'US'

            const primaryMarket = (marketplaces && marketplaces[0]) || 'ebay'
            const economics = calculateUnitEconomics({
              sellingPrice,
              unitCost,
              shippingCost,
              marketplace: primaryMarket,
              dutyApplies,
            })

            const marginPct = economics.netMarginPct

            // Strict Filter: Reject candidates without verified sourcing costs or below min margin threshold
            if (marginPct == null || marginPct < minMarginThreshold || !sourcing?.buyUrl) {
              console.log(
                `[DiscoveryAgent2] Skipped "${candidate.title}": ${
                  marginPct == null ? 'unverified sourcing cost' : `margin ${marginPct}% < threshold ${minMarginThreshold}%`
                }`,
              )
              return null
            }

            // 2D: Deterministic Opportunity Scoring
            const scoreData = computeOpportunityScore({
              netMarginPct: marginPct,
              demandTier: validation.demandTier,
              rating: validation.otherRating || candidate.rating,
              competitionLevel: validation.competitionLevel,
              supplierType: sourcing?.supplierType,
              shipFromCountry: sourcing?.shipFromCountry,
              estimatedDeliveryDays: sourcing?.estimatedDeliveryDays,
            })

            // 2E: Short factual AI Notes
            const aiNotes = await generateAiNotes({
              client,
              candidate,
              validation,
              sourcing,
              economics,
              scoreData,
            })

            return {
              title: candidate.title,
              category: candidate.category || categories[0] || 'General',
              marketplace: candidate.observedMarketplace || 'ebay',
              listingUrl: candidate.listingUrl || null,
              sourceUrl: sourcing.buyUrl,
              image: null,
              metrics: {
                price: economics.sellingPrice,
                averagePrice: economics.sellingPrice,
                estimatedCost: economics.unitCost,
                category: candidate.category || categories[0] || 'General',
                monthlySales: validation.ebaySoldCount || null,
                rating: validation.otherRating || candidate.rating || null,
                reviewCount: validation.otherReviewCount || candidate.reviewCount || null,
                competitorCount: validation.ebayActiveListings || null,
                netProfit: economics.netProfit,
              },
              validation: {
                demandTier: validation.demandTier,
                matchConfidence: validation.matchConfidence,
                ebayPriceHigh: validation.ebayPriceHigh,
                ebayPriceLow: validation.ebayPriceLow,
                otherMarketplace: validation.otherMarketplace,
                otherUrl: validation.otherUrl,
              },
              sourcing: {
                buyUrl: sourcing.buyUrl,
                unitCostUsd: sourcing.unitCostUsd,
              },
              estimatedMargin: Math.round(marginPct),
              opportunityScore: scoreData.opportunityScore,
              confidence: scoreData.confidence,
              aiNotes,
            }
          } catch (itemErr) {
            console.warn(`[DiscoveryAgent2] Error analyzing candidate "${candidate.title}":`, itemErr.message)
            return null
          }
        }),
      )

      for (const opp of batchResults) {
        if (opp) {
          opp.rank = evaluatedOpportunities.length + 1
          evaluatedOpportunities.push(opp)
        }
      }

      // Incremental DB update so progress and finished candidates are never lost on crash
      await ResearchReport2.findByIdAndUpdate(reportId, {
        $set: { opportunities: evaluatedOpportunities },
      })
    }

    console.log(`[DiscoveryAgent2] Deep-dive complete. ${evaluatedOpportunities.length} opportunities meet criteria.`)

    // Stage 3: Rank top 10-20 by Opportunity Score
    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Scoring & Ranking',
      'progress.percent': 90,
      'progress.currentItem': 'Sorting and finalizing top ranked opportunities...',
    })

    evaluatedOpportunities.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    const topOpportunities = evaluatedOpportunities.slice(0, 20).map((opp, idx) => ({
      ...opp,
      rank: idx + 1,
    }))

    // Format date at completion: "YYYY-MM-DD" for accurate date-wise clustering
    const completionDate = new Date().toISOString().slice(0, 10)
    const summaryNarrative = `Completed live market discovery across ${categories.join(', ')}. Discovered ${
      candidates.length
    } candidates and ranked top ${topOpportunities.length} verified opportunities meeting the ≥${minMarginThreshold}% profit margin requirement.`

    await ResearchReport2.findByIdAndUpdate(reportId, {
      status: 'completed',
      reportDate: completionDate,
      finishedAt: new Date(),
      opportunities: topOpportunities,
      summary: summaryNarrative,
      progress: {
        stage: 'Completed',
        step: totalCandidates,
        totalSteps: totalCandidates,
        percent: 100,
        currentItem: `${topOpportunities.length} opportunities verified & saved.`,
      },
    })

    console.log(`[DiscoveryAgent2] Run completed successfully! ${topOpportunities.length} opportunities saved.`)
    return {
      reportId,
      status: 'completed',
      count: topOpportunities.length,
    }
  } catch (err) {
    console.error(`[DiscoveryAgent2] Run failed for reportId ${reportId}:`, err)
    await ResearchReport2.findByIdAndUpdate(reportId, {
      status: 'failed',
      finishedAt: new Date(),
      error: err.message,
    })
    throw err
  }
}

module.exports = {
  runDiscoveryAgent,
  runDiscoveryAgentTwo: runDiscoveryAgent,
}
