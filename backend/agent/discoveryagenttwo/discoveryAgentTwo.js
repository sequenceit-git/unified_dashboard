/**
 * Product Discovery 2 Agent (DiscoveryAgentTwo)
 *
 * Implements a 3-Stage Agentic Loop:
 *   Stage 1: Scan target marketplaces (eBay, Temu, Amazon, Walmart) for 15-25 candidate products.
 *   Stage 2: Sequential Deep-Dive Loop (1 product per iteration):
 *            - Cross-market demand and review validation
 *            - Find cheaper sourcing links (AliExpress, 1688, Temu wholesale)
 *            - Landed unit economics & net margin calculation
 *            - Explainable 0-100 Opportunity Scoring
 *   Stage 3: Filter by margin threshold (default 15% or user-specified), rank top 10-20,
 *            and save directly to ResearchReport2.
 */

const OpenAI = require('openai')
const ResearchReport2 = require('../../models/ResearchReport2')
const { skillManager } = require('./skills/index')

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set OPENAI_API or OPENAI_API_KEY.')
  }
  return new OpenAI({ apiKey })
}

/**
 * Extract clean JSON from OpenAI response text
 */
function parseJsonSafe(text) {
  if (!text) return null
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * Stage 1: Discover 15-25 candidate products from target marketplaces
 */
async function discoverCandidates({ client, categories, niche, instructions, minMarginThreshold = 15 }) {
  const skillPrompt = skillManager.loadSkill('product-discovery-search') || ''
  const systemPrompt = `You are an elite E-Commerce Product Discovery Agent.
${skillPrompt}

Return ONLY a valid JSON object in the following format:
{
  "candidates": [
    {
      "title": "string (specific, searchable product title)",
      "marketplace": "ebay" | "temu" | "amazon" | "walmart",
      "approximatePrice": 25.0,
      "marketplaceUrl": "https://...",
      "category": "string"
    }
  ]
}`

  const userQuery = `Find high-velocity, trending products for category: "${categories.join(', ')}"${
    niche ? `, with niche focus: "${niche}"` : ''
  }.${instructions ? ` User notes: "${instructions}".` : ''}
Focus on products capable of yielding at least ${minMarginThreshold}% net profit margin after marketplace fees and wholesale sourcing costs.
Return 15 to 20 candidates in the "candidates" JSON array.`

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ],
  })

  const parsed = parseJsonSafe(response.choices[0].message.content)
  const list = parsed?.candidates || (Array.isArray(parsed) ? parsed : [])
  return Array.isArray(list) ? list : []
}

/**
 * Stage 2: Deep-dive an individual product (sequential loop)
 */
async function analyzeSingleCandidate({ client, candidate, userMinMargin = 15 }) {
  const crossMarketSkill = skillManager.loadSkill('cross-market-validation') || ''
  const sourcingSkill = skillManager.loadSkill('sourcing-and-unit-economics') || ''
  const scoringSkill = skillManager.loadSkill('opportunity-scoring-rubric') || ''

  const systemPrompt = `You are a precision E-Commerce Unit Economics & Sourcing Evaluator.
${crossMarketSkill}
${sourcingSkill}
${scoringSkill}

Perform deep validation on this single product.
Formulas:
- Net Profit = sellingPrice - costPrice - (sellingPrice * 0.15)
- Margin % = (Net Profit / sellingPrice) * 100

Return ONLY a JSON object with:
{
  "title": string,
  "category": string,
  "marketplace": string,
  "sellingPrice": number,
  "costPrice": number,
  "estimatedMargin": number,
  "monthlySales": number,
  "rating": number,
  "reviewCount": number,
  "competitionLevel": "Low" | "Medium" | "High",
  "opportunityScore": number,
  "sourceUrl": string (real URL where the item or generic equivalent can be sourced cheaper, e.g. on AliExpress, Temu, or wholesale),
  "image": string or null,
  "aiNotes": string (1-2 sentences on why this product is worth buying/selling and key margin facts)
}`

  const userQuery = `Analyze this candidate product:
Title: "${candidate.title}"
Marketplace: "${candidate.marketplace}"
Approx Selling Price: $${candidate.approximatePrice || 25}
Category: "${candidate.category || ''}"

1. Check demand, rating, and review health.
2. Find the cheapest sourcing buy price on AliExpress, 1688, or Temu and provide a buy URL.
3. Calculate Net Profit Margin % and assign 0-100 Opportunity Score.`

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ],
  })

  const evaluated = parseJsonSafe(response.choices[0].message.content)
  if (!evaluated) return null

  // Enforce margin threshold filter
  const margin = Number(evaluated.estimatedMargin) || 0
  if (margin < userMinMargin) {
    console.log(`[DiscoveryAgent2] Filtered out "${evaluated.title}" — margin ${margin}% is below ${userMinMargin}% threshold`)
    return null
  }

  return evaluated
}

/**
 * Parse user instructions for custom margin override (e.g., "margin > 20%", "min margin 25%", "margin 20%", "20% margin")
 * Strictly defaults to 15% if no valid margin is specified.
 */
function extractUserMarginThreshold(instructions = '') {
  if (!instructions || typeof instructions !== 'string') return 15

  // 1. Pattern like "margin 20%", "margin: 20%", "min margin 20%", "margin >= 20%", "filter margin less than 20%"
  const p1 = /(?:margin|profit)\s*(?:>=|>|:|at least|minimum|min|of|is|should be|less than|below)?\s*(\d+)\s*%/i
  const m1 = instructions.match(p1)
  if (m1) {
    const val = parseInt(m1[1], 10)
    if (!isNaN(val) && val >= 5 && val <= 85) return val
  }

  // 2. Pattern like "20% margin", "25% profit margin"
  const p2 = /(\d+)\s*%\s*(?:profit\s*)?margin/i
  const m2 = instructions.match(p2)
  if (m2) {
    const val = parseInt(m2[1], 10)
    if (!isNaN(val) && val >= 5 && val <= 85) return val
  }

  // 3. Pattern like "margin > 20", "min margin 25" (without percentage symbol)
  const p3 = /(?:margin|profit)\s*(?:>=|>|:|at least|minimum|min|less than|below)\s*(\d+)/i
  const m3 = instructions.match(p3)
  if (m3) {
    const val = parseInt(m3[1], 10)
    if (!isNaN(val) && val >= 5 && val <= 85) return val
  }

  return 15 // Default 15% threshold: filter out anything < 15%
}

/**
 * Main Agent Runner for Product Discovery 2
 */
async function runDiscoveryAgentTwo({ categories = [], niche = '', instructions = '', reportId, user }) {
  console.log(`[DiscoveryAgent2] Starting run for reportId: ${reportId}, categories: [${categories.join(', ')}]`)

  const client = getOpenAIClient()
  const minMarginThreshold = extractUserMarginThreshold(instructions)
  console.log(`[DiscoveryAgent2] Active minimum margin filter: ${minMarginThreshold}%`)

  // Update report to running
  await ResearchReport2.findByIdAndUpdate(reportId, {
    status: 'running',
    startedAt: new Date(),
    progress: {
      stage: 'Scanning Marketplaces',
      step: 1,
      totalSteps: 20,
      percent: 5,
      currentItem: 'Scanning trending items across eBay, Temu, Amazon & Walmart...',
    },
  })

  try {
    // Stage 1: Discover 15-25 raw product candidates
    console.log('[DiscoveryAgent2] Stage 1: Scanning marketplaces for candidates…')
    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Scanning Marketplaces',
      'progress.percent': 10,
      'progress.currentItem': `Querying GPT-5 Mini across categories: ${categories.join(', ')}`,
    })

    const candidates = await discoverCandidates({
      client,
      categories,
      niche,
      instructions,
      minMarginThreshold,
    })
    console.log(`[DiscoveryAgent2] Discovered ${candidates.length} candidates.`)

    if (!candidates.length) {
      throw new Error('No candidate products discovered for the requested category/niche.')
    }

    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Evaluating Products',
      'progress.totalSteps': candidates.length,
      'progress.percent': 20,
      'progress.currentItem': `Discovered ${candidates.length} candidates. Starting cross-market validation loop...`,
    })

    // Stage 2: Sequential Deep-Dive Loop (1 candidate per iteration)
    const evaluatedOpportunities = []
    const totalCandidates = candidates.length

    for (let i = 0; i < totalCandidates; i++) {
      const candidate = candidates[i]
      const stepNum = i + 1
      // Scale Stage 2 progress from 20% to 85%
      const loopPercent = Math.min(85, Math.round(20 + ((stepNum / totalCandidates) * 65)))

      console.log(`[DiscoveryAgent2] Stage 2 Loop [${stepNum}/${totalCandidates}]: Evaluating "${candidate.title}"…`)

      await ResearchReport2.findByIdAndUpdate(reportId, {
        'progress.stage': `Evaluating (${stepNum}/${totalCandidates})`,
        'progress.step': stepNum,
        'progress.totalSteps': totalCandidates,
        'progress.percent': loopPercent,
        'progress.currentItem': candidate.title,
      })

      try {
        const itemResult = await analyzeSingleCandidate({
          client,
          candidate,
          userMinMargin: minMarginThreshold,
        })

        if (itemResult) {
          evaluatedOpportunities.push(itemResult)
        }
      } catch (itemErr) {
        console.warn(`[DiscoveryAgent2] Error analyzing candidate "${candidate.title}":`, itemErr.message)
      }
    }

    console.log(`[DiscoveryAgent2] Stage 2 complete. ${evaluatedOpportunities.length} passed the ${minMarginThreshold}% margin threshold.`)

    // Stage 3: Rank by Opportunity Score and take top 10 to 20
    await ResearchReport2.findByIdAndUpdate(reportId, {
      'progress.stage': 'Scoring & Ranking',
      'progress.percent': 90,
      'progress.currentItem': `Ranking top opportunities meeting ≥${minMarginThreshold}% net margin requirement...`,
    })

    evaluatedOpportunities.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    const topOpportunities = evaluatedOpportunities.slice(0, 20).map((opp, idx) => ({
      rank: idx + 1,
      title: opp.title,
      category: opp.category || categories[0] || 'General',
      marketplace: opp.marketplace || 'ebay',
      sourceUrl: opp.sourceUrl || candidateUrlFallback(opp),
      image: opp.image || null,
      metrics: {
        price: opp.sellingPrice,
        averagePrice: opp.sellingPrice,
        estimatedCost: opp.costPrice,
        category: opp.category || categories[0] || 'General',
        monthlySales: opp.monthlySales || 500,
        salesVolume: opp.monthlySales || 500,
        rating: opp.rating || 4.5,
        reviewCount: opp.reviewCount || 120,
        competitorCount: opp.competitionLevel === 'High' ? 45 : opp.competitionLevel === 'Medium' ? 18 : 6,
      },
      estimatedMargin: Math.round(opp.estimatedMargin || 25),
      opportunityScore: Math.round(opp.opportunityScore || 75),
      aiNotes: opp.aiNotes || `Discovered with estimated ${opp.estimatedMargin}% profit margin after marketplace fees.`,
    }))

    // Save final opportunities directly to ResearchReport2
    const summaryNarrative = `Completed market discovery across ${categories.join(', ')}. Analyzed ${
      candidates.length
    } candidates and ranked top ${topOpportunities.length} opportunities meeting the ≥${minMarginThreshold}% profit margin requirement.`

    await ResearchReport2.findByIdAndUpdate(reportId, {
      status: 'completed',
      finishedAt: new Date(),
      opportunities: topOpportunities,
      summary: summaryNarrative,
      progress: {
        stage: 'Completed',
        step: totalCandidates,
        totalSteps: totalCandidates,
        percent: 100,
        currentItem: `${topOpportunities.length} high-margin opportunities finalized.`,
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

function candidateUrlFallback(opp) {
  if (opp.title) {
    return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(opp.title)}`
  }
  return 'https://www.aliexpress.com'
}

module.exports = {
  runDiscoveryAgentTwo,
}
