/**
 * Product Discovery 2 Agent (DiscoveryAgentTwo)
 *
 * Implements Live Web Search via OpenAI Responses API,
 * 3-Stage Agentic Loop with per-product sequential pipeline,
 * and deterministic landed unit economics & scoring in Node.js.
 */

const OpenAI = require('openai')
const ResearchReport2 = require('../../models/ResearchReport')
const { getAiConfig } = require('../../services/aiSettings')
const { skillManager } = require('./skills/index')
const { computeOpportunityScore } = require('./economics')
const { productImages } = require('./listingImage')
const { placeOf, validatedUsListings } = require('./usListings')

async function updateWhileRunning(reportId, update) {
  const result = await ResearchReport2.updateOne(
    { _id: reportId, status: { $in: ['queued', 'running'] } },
    update,
  )
  return result.matchedCount > 0
}

async function stoppedByUser(reportId) {
  const report = await ResearchReport2.findById(reportId).select('status')
  return !report || report.status === 'stopped' || report.status === 'stopping'
}

/** OpenAI client from Settings > AI agent (backend env as fallback); `client.model` is the chosen model. */
async function getOpenAIClient() {
  const { apiKey, model } = await getAiConfig()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Add it in Settings > AI agent.')
  }
  const client = new OpenAI({ apiKey })
  client.model = model
  return client
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

/** Split pasted "Home & Kitchen, Electronics" chips and drop duplicates. */
function normalizeCategories(values) {
  const list = []
  for (const value of Array.isArray(values) ? values : [values]) {
    for (const part of String(value || '').split(/[,|;]/)) {
      const name = part.trim()
      if (name && !list.some((item) => item.toLowerCase() === name.toLowerCase())) list.push(name)
    }
  }
  return list.slice(0, 6)
}

function uniqueUrls(values) {
  const seen = new Set()
  const urls = []
  for (const value of values) {
    const url = typeof value === 'string' ? value.trim() : ''
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls.slice(0, 8)
}

function linkOf(label, url, kind, price) {
  const href = typeof url === 'string' ? url.trim() : ''
  if (!/^https?:\/\//i.test(href)) return null
  const amount = Number(price)
  return {
    label: label || (kind === 'supplier' ? 'Supplier' : 'Listing'),
    url: href,
    kind,
    price: Number.isFinite(amount) ? amount : null,
  }
}

function normalizeSpecs(value) {
  const rows = []
  const push = (name, raw) => {
    const label = String(name || '').trim()
    const specValue = raw == null ? '' : String(raw).trim()
    if (!label || !specValue || rows.some((row) => row.name.toLowerCase() === label.toLowerCase())) return
    rows.push({ name: label, value: specValue })
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      push(item.name || item.label || item.key, item.value)
    }
  } else if (value && typeof value === 'object') {
    for (const [name, specValue] of Object.entries(value)) push(name, specValue)
  }
  return rows.slice(0, 12)
}

function normalizeHighlights(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const lines = []
  for (const item of value) {
    const line = String(item || '').trim()
    const key = line.toLowerCase()
    if (!line || seen.has(key)) continue
    seen.add(key)
    lines.push(line)
  }
  return lines.slice(0, 6)
}

const SOURCE_LABELS = {
  ebay: 'eBay',
  amazon: 'Amazon',
  walmart: 'Walmart',
  temu: 'Temu',
  tiktok: 'TikTok Shop',
  tiktok_shop: 'TikTok Shop',
}

function marketplaceLabel(id) {
  const key = String(id || '').trim().toLowerCase()
  return SOURCE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Listing')
}

function uniqueSources(links) {
  const seen = new Set()
  const sources = []
  for (const link of links) {
    if (!link?.url || seen.has(link.url)) continue
    seen.add(link.url)
    sources.push(link)
  }
  return sources
}

/**
 * Robust web search helper using client.responses.create with exponential retry & model fallback
 */
async function callWebSearch({ client, prompt, allowedDomains = [], maxRetries = 2 }) {
  const primaryModel = client.model
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
      const isModelNotFound = err?.status === 404 || err?.code === 'model_not_found'
        || /model .*(does not exist|not found)/i.test(err?.message || '')

      if (isModelNotFound && currentModel !== fallbackModel) {
        console.warn(`[DiscoveryAgent] Model ${currentModel} unavailable. Switching to fallback: ${fallbackModel}`)
        currentModel = fallbackModel
        client.model = fallbackModel
        if (client.reportId) {
          await updateWhileRunning(client.reportId, { $set: { 'params.model': fallbackModel } }).catch(() => {})
        }
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
async function discoverCandidates({ client, categories, niche, marketplaces = ['ebay', 'amazon', 'walmart', 'temu'], count = 20, exclude = [] }) {
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
Search live US retail marketplaces (${marketplaces.join(', ')}) for products that are best selling or going viral right now.
Target Category: "${categories.join(', ')}".
${niche ? `Niche Focus: "${niche}".` : ''}
Current Year: ${currentYear}.

RULES:
1. United States only. Use ebay.com, amazon.com, walmart.com, and temu.com. Do not use other countries such as ebay.co.uk, amazon.co.uk, amazon.ca, or walmart.ca. Prices are USD.
2. Search real product listings on those US sites. Prefer best-seller lists, movers, hot badges, and listings with high sold or bought counts.
3. Do not search for suppliers, wholesalers, factories, or unit cost.
4. Do not fabricate or estimate prices. If not observable, set observedPriceUsd to null.
5. Every URL must be a United States product page you opened: ebay.com/itm/..., amazon.com/dp/..., walmart.com/ip/..., or a temu.com goods page. Never use search pages, homepages, or placeholders.
6. demandSignalText must quote the visible sales signal, such as "12k sold" or "Best Seller".
7. Open the listing page. Copy what the product is, its feature bullets, and the specification rows you can see. Leave a spec null only when the page does not show it.

Return ONLY a valid JSON object matching this schema. Keep each object short — later steps read the listing page for details:
{
  "candidates": [
    {
      "title": "string (specific product title, not a category)",
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

${exclude.length ? `Skip these products, already reviewed in this run: ${exclude.slice(0, 40).map((title) => `"${title}"`).join('; ')}.` : ''}

Return ${count} distinct best-selling or viral products. Return fewer only when fewer real listings exist. Skip anything that is only a supplier or wholesale page.`

  const rawText = await callWebSearch({ client, prompt, allowedDomains })
  const parsed = parseJsonSafe(rawText)
  const list = parsed?.candidates || (Array.isArray(parsed) ? parsed : [])
  return (Array.isArray(list) ? list : []).filter((candidate) => placeOf(candidate?.listingUrl))
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
Listing to open first: ${candidate.listingUrl || 'search for the title'}
Client Target Selling Marketplaces: ${targetMarketplaces.join(', ')}

TASK:
1. United States only. Open ebay.com, amazon.com, walmart.com, and temu.com. Ignore every other country site.
2. Open the listing above and copy the product information shown on the page: description, feature bullets, and specification table.
3. Find this same product on all four US sites. Return one product-page URL per site in listingLinks: eBay (/itm/id), Amazon (/dp/ASIN), Walmart (/ip/id), and Temu (goods page). If a site has no listing, omit that site. Do not invent URLs.
4. Record eBay active listing count, median sold price, and sold counts if visible.
5. Set demandTier: "High" | "Medium" | "Low" | "Unknown".
6. Set demandEvidence: "measured" | "inferred".
Do not invent specifications. If a spec is not on the page, omit it.

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
  "description": "string (2-4 sentences from the listing about the product)",
  "highlights": ["string (feature bullet, up to 5)"],
  "specs": [{ "name": "string", "value": "string" }],
  "imageUrls": ["string (product image URLs seen on the listings, up to 4)"],
  "listingLinks": [
    { "marketplace": "ebay" | "amazon" | "walmart" | "temu", "url": "https US product page", "price": number or null }
  ],
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
 * Stage 2C: Generate concise factual AI Notes
 */
async function generateAiNotes({ client, candidate, validation, sellingPrice, scoreData }) {
  const skillPrompt = skillManager.loadSkill('opportunity-scoring-rubric') || ''

  const prompt = `You are an E-Commerce Advisor synthesizing findings.
${skillPrompt}

FACTS:
Product: "${candidate.title}"
Listed price: $${sellingPrice || 'N/A'}
Best-seller signal: ${candidate.demandSignalText || 'Not stated'}
Units sold: ${validation.ebaySoldCount || 'Not stated'}
Demand: ${validation.demandTier || 'Unknown'}
Rating: ${validation.otherRating || candidate.rating || 'Unknown'} (${validation.otherReviewCount || candidate.reviewCount || 'unknown'} reviews)
Score: ${scoreData.opportunityScore}/100

TASK:
Write 1-2 concise sentences on why this is a top-selling product. Cite the sold count or best-seller label, the rating, the demand, and the listed price. Do not mention profit, margin, unit cost, wholesale, or suppliers.`

  const model = client.model
  try {
    const res = await client.responses.create({
      model,
      input: prompt,
    })
    return (res.output_text || '').trim()
  } catch {
    return `Selling on ${candidate.observedMarketplace || 'the marketplace'}${candidate.demandSignalText ? `: ${candidate.demandSignalText}` : ''}.`
  }
}

/**
 * Main Agent Runner for Product Discovery
 */
async function runDiscoveryAgent({ categories: rawCategories = [], niche = '', instructions = '', marketplaces, reportId, user }) {
  const categories = normalizeCategories(rawCategories)
  console.log(`[DiscoveryAgent] Starting run for reportId: ${reportId}, categories: [${categories.join(', ')}]`)

  let client
  try {
    client = await getOpenAIClient()
    client.reportId = reportId
  } catch (err) {
    await updateWhileRunning(reportId, { $set: { status: 'failed', finishedAt: new Date(), error: err.message } })
    throw err
  }

  const started = await updateWhileRunning(reportId, {
    $set: {
      status: 'running',
      startedAt: new Date(),
      'params.model': client.model,
      progress: {
        stage: 'Scanning Marketplaces',
        step: 1,
        totalSteps: 20,
        percent: 5,
        currentItem: `Initializing Web Search across ${categories.join(', ')}...`,
      },
    },
  })
  if (!started) return { reportId, status: 'stopped' }

  try {
    if (await stoppedByUser(reportId)) return { reportId, status: 'stopped' }

    // Stage 1: Live Web Search across target marketplaces
    const scanning = await updateWhileRunning(reportId, {
      $set: {
        'progress.stage': 'Scanning Marketplaces',
        'progress.percent': 10,
        'progress.currentItem': 'Searching best sellers and viral products on eBay, Amazon, Walmart, Temu, and TikTok Shop...',
      },
    })
    if (!scanning) return { reportId, status: 'stopped' }

    const TARGET_PRODUCTS = 20
    const MAX_ROUNDS = 3
    // `marketplaces` is where the user sells; products are found on every US marketplace.
    const searchMarkets = ['ebay', 'amazon', 'walmart', 'temu']
    const queue = []
    const triedTitles = []
    let discoveredCount = 0
    let round = 0

    const fillQueue = async () => {
      if (queue.length || round >= MAX_ROUNDS) return 0
      round += 1
      const needed = TARGET_PRODUCTS - evaluatedOpportunities.length
      // One search per category: a single search over several categories returns too little to parse.
      const perCategory = Math.min(TARGET_PRODUCTS, Math.max(4, Math.ceil((needed + 6) / categories.length)))
      // One category at a time: parallel web searches hit OpenAI rate limits and come back empty.
      const lists = []
      const failures = []
      for (const category of categories) {
        if (await stoppedByUser(reportId)) break
        await updateWhileRunning(reportId, {
          $set: { 'progress.currentItem': `Searching best sellers in ${category}...` },
        })
        try {
          const list = await discoverCandidates({
            client,
            categories: [category],
            niche,
            marketplaces: searchMarkets,
            count: perCategory,
            exclude: triedTitles,
          })
          console.log(`[DiscoveryAgent2] Round ${round}: ${category} returned ${list.length} products`)
          lists.push(list.map((candidate) => ({ ...candidate, category })))
        } catch (err) {
          failures.push(err)
          console.warn(`[DiscoveryAgent2] Round ${round}: ${category} search failed:`, err.message)
        }
      }
      if (!lists.length && failures.length) throw failures[0]
      const found = []
      for (let index = 0; lists.some((list) => index < list.length); index += 1) {
        for (const list of lists) if (list[index]) found.push(list[index])
      }
      let added = 0
      for (const candidate of found) {
        const key = String(candidate?.title || '').trim().toLowerCase()
        if (!key || triedTitles.some((title) => title.toLowerCase() === key)) continue
        triedTitles.push(candidate.title)
        queue.push(candidate)
        added += 1
      }
      discoveredCount += added
      console.log(`[DiscoveryAgent2] Round ${round}: ${found.length} found, ${added} new; ${evaluatedOpportunities.length}/${TARGET_PRODUCTS} saved.`)
      return added
    }

    const evaluatedOpportunities = []
    const added = await fillQueue()
    if (!added) {
      throw new Error('No candidate products found via live web search. Please try another category or niche.')
    }

    if (await stoppedByUser(reportId)) return { reportId, status: 'stopped' }

    const evaluating = await updateWhileRunning(reportId, {
      $set: {
        'progress.stage': 'Evaluating Products',
        'progress.totalSteps': TARGET_PRODUCTS,
        'progress.percent': 20,
        'progress.currentItem': `Found ${discoveredCount} products. Checking which ones are actually selling...`,
      },
    })
    if (!evaluating) return { reportId, status: 'stopped' }

    // Stage 2: two products at a time. Search again when confirmed products are still under 20.
    const BATCH_SIZE = 2

    while (queue.length && evaluatedOpportunities.length < TARGET_PRODUCTS) {
      if (await stoppedByUser(reportId)) return { reportId, status: 'stopped' }
      const batch = queue.splice(0, BATCH_SIZE)
      const savedCount = evaluatedOpportunities.length
      const loopPercent = Math.min(85, Math.round(20 + ((savedCount / TARGET_PRODUCTS) * 65)))

      console.log(`[DiscoveryAgent2] Evaluating batch [${savedCount}/${TARGET_PRODUCTS} saved]: ${batch.map((c) => `"${c.title}"`).join(', ')}`)

      const progressSaved = await updateWhileRunning(reportId, {
        $set: {
          'progress.stage': `Evaluating (${savedCount}/${TARGET_PRODUCTS} saved)`,
          'progress.step': savedCount,
          'progress.totalSteps': TARGET_PRODUCTS,
          'progress.percent': loopPercent,
          'progress.currentItem': batch.map((c) => c.title).join(' | '),
        },
      })
      if (!progressSaved) return { reportId, status: 'stopped' }

      const batchResults = await Promise.all(
        batch.map(async (candidate) => {
          try {
            // 2A: Validate Demand & Competition
            const validation = await validateProductDemand({
              client,
              candidate,
              targetMarketplaces: marketplaces && marketplaces.length ? marketplaces : ['ebay'],
            })

            const rawLinks = [
              { url: candidate.listingUrl, price: candidate.observedPriceUsd, marketplace: candidate.observedMarketplace },
              { url: validation.ebaySourceUrl, price: validation.ebayPriceMedian, marketplace: 'ebay' },
              { url: validation.otherUrl, price: null, marketplace: validation.otherMarketplace },
              ...(Array.isArray(validation.listingLinks) ? validation.listingLinks : []),
            ]
            const verified = await validatedUsListings(rawLinks)
            const sources = uniqueSources([
              ...verified.map((source) => ({ ...source, verified: true })),
              ...rawLinks.map((link) => linkOf(
                marketplaceLabel(link.marketplace || link.label),
                link.url,
                'listing',
                link.price,
              )).filter(Boolean),
            ])
            if (!sources.length) {
              console.log(`[DiscoveryAgent2] Skipped "${candidate.title}": no source link`)
              return null
            }
            const listingUrl = sources.find((source) => source.label === 'eBay')?.url || sources[0].url

            const sellingPrice = validation.ebayPriceMedian || candidate.observedPriceUsd || null
            const scoreData = computeOpportunityScore({
              demandTier: validation.demandTier,
              rating: validation.otherRating || candidate.rating,
              soldCount: validation.ebaySoldCount,
              demandSignal: candidate.demandSignalText,
              price: sellingPrice,
              highDefectRisk: validation.highDefectRisk,
            })

            const aiNotes = await generateAiNotes({
              client,
              candidate,
              validation,
              sellingPrice,
              scoreData,
            })

            const description = [validation.description, candidate.description]
              .map((text) => String(text || '').trim())
              .sort((a, b) => b.length - a.length)[0] || ''
            const highlights = normalizeHighlights([
              ...(Array.isArray(validation.highlights) ? validation.highlights : []),
              ...(Array.isArray(candidate.highlights) ? candidate.highlights : []),
            ])
            const specs = normalizeSpecs([
              ...normalizeSpecs(validation.specs),
              ...normalizeSpecs(candidate.specs),
            ])

            const images = await productImages({
              hinted: [
                ...(Array.isArray(candidate.imageUrls) ? candidate.imageUrls : []),
                ...(Array.isArray(validation.imageUrls) ? validation.imageUrls : []),
              ],
              pages: [listingUrl, candidate.listingUrl, validation.ebaySourceUrl, validation.otherUrl],
              title: candidate.title,
            })
            return {
              title: candidate.title,
              brand: candidate.brand || validation.brand || '',
              description,
              highlights,
              specs,
              demandSignal: candidate.demandSignalText || validation.demandSignalText || '',
              category: candidate.category || categories[0] || 'General',
              marketplace: candidate.observedMarketplace || 'ebay',
              listingUrl,
              image: images[0] || null,
              images,
              sources,
              linksVerified: sources.some((source) => source.verified),
              metrics: {
                price: sellingPrice,
                averagePrice: sellingPrice,
                category: candidate.category || categories[0] || 'General',
                monthlySales: validation.ebaySoldCount || null,
                rating: validation.otherRating || candidate.rating || null,
                reviewCount: validation.otherReviewCount || candidate.reviewCount || null,
                competitorCount: validation.ebayActiveListings || null,
              },
              validation: {
                demandTier: validation.demandTier,
                matchConfidence: validation.matchConfidence,
                ebayPriceHigh: validation.ebayPriceHigh,
                ebayPriceLow: validation.ebayPriceLow,
                otherMarketplace: validation.otherMarketplace,
                otherUrl: validation.otherUrl,
                ebaySourceUrl: validation.ebaySourceUrl || null,
                competitionLevel: validation.competitionLevel || null,
                topComplaints: Array.isArray(validation.topComplaints) ? validation.topComplaints : [],
              },
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
        if (opp && evaluatedOpportunities.length < TARGET_PRODUCTS) {
          opp.rank = evaluatedOpportunities.length + 1
          evaluatedOpportunities.push(opp)
        }
      }

      const saved = await updateWhileRunning(reportId, {
        $set: { opportunities: evaluatedOpportunities },
      })
      if (!saved) return { reportId, status: 'stopped' }

      if (evaluatedOpportunities.length < TARGET_PRODUCTS && !queue.length) {
        const searching = await updateWhileRunning(reportId, {
          $set: {
            'progress.currentItem': `${evaluatedOpportunities.length} of ${TARGET_PRODUCTS} confirmed. Searching for more products...`,
          },
        })
        if (!searching) return { reportId, status: 'stopped' }
        await fillQueue()
      }
    }

    if (await stoppedByUser(reportId)) return { reportId, status: 'stopped' }

    console.log(`[DiscoveryAgent2] Deep-dive complete. ${evaluatedOpportunities.length} opportunities meet criteria.`)

    const ranking = await updateWhileRunning(reportId, {
      $set: {
        'progress.stage': 'Scoring & Ranking',
        'progress.percent': 90,
        'progress.currentItem': 'Sorting and finalizing top ranked opportunities...',
      },
    })
    if (!ranking) return { reportId, status: 'stopped' }

    const demandRank = { high: 3, medium: 2, low: 1 }
    evaluatedOpportunities.sort((a, b) => {
      const demandGap = (demandRank[String(b.validation?.demandTier || '').toLowerCase()] || 0)
        - (demandRank[String(a.validation?.demandTier || '').toLowerCase()] || 0)
      if (demandGap) return demandGap
      return (b.opportunityScore || 0) - (a.opportunityScore || 0)
    })
    const topOpportunities = evaluatedOpportunities.slice(0, 20).map((opp, idx) => ({
      ...opp,
      rank: idx + 1,
    }))

    // Format date at completion: "YYYY-MM-DD" for accurate date-wise clustering
    const completionDate = new Date().toISOString().slice(0, 10)
    const summaryNarrative = `Completed live market discovery across ${categories.join(', ')}. Discovered ${
      discoveredCount
    } candidates and ranked ${topOpportunities.length} of the top ${TARGET_PRODUCTS} products.`

    const finished = await updateWhileRunning(reportId, {
      $set: {
        status: 'completed',
        reportDate: completionDate,
        finishedAt: new Date(),
        opportunities: topOpportunities,
        summary: summaryNarrative,
        progress: {
          stage: 'Completed',
          step: topOpportunities.length,
          totalSteps: TARGET_PRODUCTS,
          percent: 100,
          currentItem: `${topOpportunities.length} opportunities verified & saved.`,
        },
      },
    })
    if (!finished) return { reportId, status: 'stopped' }

    console.log(`[DiscoveryAgent2] Run completed successfully! ${topOpportunities.length} opportunities saved.`)
    require('../../services/notify').reportFinished({ _id: reportId }, { ok: true, count: topOpportunities.length }).catch(() => {})
    return {
      reportId,
      status: 'completed',
      count: topOpportunities.length,
    }
  } catch (err) {
    console.error(`[DiscoveryAgent2] Run failed for reportId ${reportId}:`, err)
    await updateWhileRunning(reportId, {
      $set: {
        status: 'failed',
        finishedAt: new Date(),
        error: err.message,
      },
    })
    require('../../services/notify').reportFinished({ _id: reportId }, { ok: false, error: err.message }).catch(() => {})
    throw err
  }
}

module.exports = {
  runDiscoveryAgent,
  runDiscoveryAgentTwo: runDiscoveryAgent,
}
