const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute, requireRole } = require('../../middleware/auth')
const ResearchReport2 = require('../../models/ResearchReport2')
const Product = require('../../models/Product')
const { runDiscoveryAgentTwo } = require('../../agent/discoveryagenttwo/discoveryAgentTwo')
const { generateRecommendationsExcel } = require('../../services/excelExport')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

// ─── GET /api/research/reports — list all reports ────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const reports = await ResearchReport2.find()
      .sort({ createdAt: -1 })
      .limit(50)
    res.json(reports)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/recommendations/:reportId ──────────────────────────────
router.get('/recommendations/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const docs = report.opportunities || []
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/report/:reportId — consolidated full report ────────────
router.get('/report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    res.json({
      report,
      recommendations: report.opportunities || [],
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/status/:reportId — poll report generation status ───────
router.get('/status/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }
    const report = await ResearchReport2.findById(reportId).select(
      'status progress error summary startedAt finishedAt createdAt params reportDate',
    )
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    res.json(report)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/export/:reportId — download Excel or CSV ──────────────
router.get('/export/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    const format = (req.query.format || 'xlsx').toLowerCase()

    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }

    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const recommendations = report.opportunities || []
    if (!recommendations.length) {
      return res.status(404).json({ error: 'No recommendations found for this report' })
    }

    if (format === 'csv') {
      const headers = [
        'sku',
        'title',
        'description',
        'category',
        'brand',
        'basePrice',
        'currency',
        'stock',
        'lowStockThreshold',
        'weight',
        'status',
        'source',
        'sourceUrl',
        'listingUrl',
        'otherUrl',
        'estimatedMarginPercent',
        'opportunityScore',
      ]

      // Protect against CSV formula injection
      const sanitizeCell = (val) => {
        if (val == null || val === '') return '""'
        let str = String(val).trim()
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `'${str}`
        }
        return `"${str.replace(/"/g, '""')}"`
      }

      const rows = recommendations.map((r, i) => {
        const title = r.title || r.productName || ''
        const category = r.category || r.metrics?.category || ''
        const basePrice = r.metrics?.price != null ? r.metrics.price : (r.price ?? r.metrics?.averagePrice ?? '')
        const description = r.aiNotes || r.recommendationReason || ''
        const sourceUrl = r.sourceUrl || r.sourcing?.buyUrl || ''
        const listingUrl = r.listingUrl || r.productUrl || ''
        const otherUrl = r.validation?.otherUrl || ''
        const margin = r.estimatedMargin != null ? r.estimatedMargin : (r.estimatedProfitMarginPercent ?? '')
        const score = r.opportunityScore ?? ''

        // Generate clean preview SKU consistent with Product model pattern
        const catClean = (category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN'
        const sku = `BOT-${catClean}-${Date.now().toString().slice(-4)}${i + 1}`

        return [
          sanitizeCell(sku),
          sanitizeCell(title),
          sanitizeCell(description),
          sanitizeCell(category),
          sanitizeCell(''), // brand (left blank for client to customize)
          basePrice !== '' ? Number(basePrice) : '',
          'USD',
          0, // stock (draft items default to 0)
          5, // lowStockThreshold
          1, // weight
          'draft',
          'research_bot',
          sanitizeCell(sourceUrl),
          sanitizeCell(listingUrl),
          sanitizeCell(otherUrl),
          margin !== '' ? Number(margin) : '',
          score !== '' ? Number(score) : '',
        ]
      })

      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
      const safeName = `product_catalog_export_${reportId.slice(-8)}.csv`
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
      return res.send(csvContent)
    }

    const categories = report.params?.categories || [report.params?.category].filter(Boolean)
    const niche = report.params?.keywords?.[0] || ''

    const buffer = await generateRecommendationsExcel(recommendations, {
      categories,
      niche,
      generatedAt: report.finishedAt || report.createdAt,
    })

    const safeName = `product_recommendations_${reportId.slice(-8)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/research/generate — trigger AI research run ───────────────────
//
// Body: { categories: string[], niche?: string, instructions?: string }
// (Legacy single-category: { category: string, niche?, instructions? })
//
// The agent runs asynchronously. The response immediately returns the new
// ResearchReport (status: 'queued'). The frontend should poll
// GET /api/research/status/:reportId to track progress.
//
router.post('/generate', async (req, res) => {
  try {
    const { categories: rawCategories, category, niche, instructions, minMargin, targetMarketplaces: rawTargetMarketplaces } = req.body

    // Accept both { categories: [...] } and legacy { category: "..." }
    const categories = Array.isArray(rawCategories) && rawCategories.length
      ? rawCategories.map((c) => c.trim()).filter(Boolean)
      : category?.trim()
        ? [category.trim()]
        : []

    if (!categories.length) {
      return res.status(400).json({ error: 'At least one product category is required' })
    }

    // Check if OPENAI_API or OPENAI_API_KEY is configured
    if (!process.env.OPENAI_API && !process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'OpenAI API key is not configured. Please set OPENAI_API in your environment variables.',
      })
    }

    // Rate Limit / Concurrency guard: Check if a run is already queued or running
    const activeRun = await ResearchReport2.findOne({
      status: { $in: ['queued', 'running'] },
    })
    if (activeRun) {
      return res.status(409).json({
        error: 'A research run is already in progress. Please wait for it to complete.',
        activeReportId: activeRun._id,
      })
    }

    // Client's target selling marketplaces (e.g. ['ebay', 'tiktok', 'temu'])
    const validMarkets = ['ebay', 'tiktok', 'temu']
    const targetMarketplaces = Array.isArray(rawTargetMarketplaces) && rawTargetMarketplaces.length
      ? rawTargetMarketplaces.map((m) => String(m).toLowerCase().trim()).filter((m) => validMarkets.includes(m))
      : ['ebay']

    const parsedMinMargin = Number(minMargin) || 15

    // Create the parent ResearchReport2 record initially with reportDate = null
    const report = await ResearchReport2.create({
      runBy: req.user?.id || null,
      trigger: 'manual',
      reportDate: null,
      params: {
        marketplaces: targetMarketplaces,
        categories,
        category: categories[0],
        keywords: niche ? [niche] : [],
        instructions: instructions?.trim() || '',
        minMargin: parsedMinMargin,
      },
      status: 'queued',
      startedAt: new Date(),
    })

    // Respond immediately so the UI can start polling
    res.status(202).json({
      _id: report._id,
      status: 'queued',
      message: 'Research job queued. Poll /api/research/status/:id for updates.',
      params: report.params,
      createdAt: report.createdAt,
    })

    // Run the agent asynchronously
    setImmediate(() => {
      runDiscoveryAgentTwo({
        categories,
        niche: niche?.trim() || '',
        instructions: instructions?.trim() || '',
        minMargin: parsedMinMargin,
        marketplaces: targetMarketplaces,
        reportId: report._id,
        user: req.user,
      }).catch((err) => {
        console.error('[research route] Agent run failed:', err.message)
      })
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/research/add-to-catalog — convert opportunity to catalog product
router.post('/add-to-catalog', requireRole('super_admin'), async (req, res) => {
  try {
    const { reportId, rank, title, price, stock, description } = req.body
    if (!reportId || rank == null) {
      return res.status(400).json({ error: 'reportId and rank are required' })
    }

    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Research report not found' })
    }

    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp) {
      return res.status(404).json({ error: `Opportunity with rank ${rank} not found in report` })
    }

    if (opp.addedProductId) {
      const existingProduct = await Product.findById(opp.addedProductId)
      if (existingProduct) {
        return res.json({ product: existingProduct, alreadyAdded: true })
      }
    }

    // Generate collision-resistant unique SKU with crypto random suffix
    const catPrefix = (opp.metrics?.category || opp.category || 'GEN')
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X')
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
    const sku = `BOT-${catPrefix}-${Date.now().toString().slice(-4)}${randomSuffix}`

    const sellingPrice = price != null ? Number(price) : opp.metrics?.averagePrice ?? opp.metrics?.price ?? 0
    const estCost = opp.metrics?.estimatedCost != null ? Number(opp.metrics.estimatedCost) : 0

    // Safely default stock to 0 to prevent ghost marketplace listing
    const safeStock = stock != null ? Number(stock) : 0

    const product = await Product.create({
      sku,
      title: title || opp.title,
      description:
        description ||
        `${opp.title}. Discovered and evaluated by Discovery Agent Two with an opportunity score of ${opp.opportunityScore || 75}/100 and estimated margin of ${opp.estimatedMargin || 15}%.`,
      category: opp.metrics?.category || opp.category || 'General',
      brand: opp.brand || 'Unbranded',
      images: opp.image ? [opp.image] : [],
      basePrice: sellingPrice,
      stock: safeStock,
      lowStockThreshold: 10,
      status: 'draft',
      source: 'research_bot',
      sourceReportId: report._id,
      attributes: {
        aiOpportunityScore: opp.opportunityScore,
        estimatedMargin: opp.estimatedMargin,
        targetMarketplace: opp.marketplace,
        sourceUrl: opp.sourceUrl,
        listingUrl: opp.listingUrl,
        estimatedCost: estCost,
      },
    })

    opp.addedProductId = product._id
    await report.save()

    res.status(201).json({ product, alreadyAdded: false })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
