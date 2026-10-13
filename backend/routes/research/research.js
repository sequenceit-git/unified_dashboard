const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute } = require('../../middleware/auth')
const ResearchReport = require('../../models/ResearchReport')
const { runMarketResearch } = require('../../agent/aimarketresearch/marketResearchAgent')
const { generateRecommendationsExcel } = require('../../services/excelExport')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

// ─── GET /api/research/reports — list all reports ────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const reports = await ResearchReport.find()
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
    let report = null
    if (mongoose.isValidObjectId(reportId)) {
      report = await ResearchReport.findById(reportId)
    }
    if (!report) {
      report = await ResearchReport.findOne().sort({ createdAt: -1 })
    }
    const docs = report?.opportunities || []
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/report/:reportId — consolidated full report ────────────
router.get('/report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    let report = null
    if (mongoose.isValidObjectId(reportId)) {
      report = await ResearchReport.findById(reportId)
    }
    if (!report) {
      report = await ResearchReport.findOne().sort({ createdAt: -1 })
    }

    res.json({
      report: report || {
        _id: 'default-report',
        status: 'completed',
        createdAt: new Date(),
      },
      recommendations: report?.opportunities || [],
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
    const report = await ResearchReport.findById(reportId).select(
      'status error summary startedAt finishedAt createdAt params',
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

    const report = await ResearchReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const recommendations = report.opportunities || []
    if (!recommendations.length) {
      return res.status(404).json({ error: 'No recommendations found for this report' })
    }

    if (format === 'csv') {
      const headers = [
        'Rank', 'Product Name', 'Category', 'Marketplace', 'Price (USD)',
        'Estimated Monthly Sales', 'Estimated Monthly Revenue', 'Rating', 'Review Count',
        'Competition Level', 'Profit Margin (%)', 'Opportunity Score (0-100)',
        'Recommendation Reason', 'Product URL',
      ]

      const rows = recommendations.map((r, i) => {
        const title = r.title || r.productName || ''
        const category = r.category || r.metrics?.category || ''
        const marketplace = r.marketplace || 'eBay'
        const price = r.price != null ? r.price : r.metrics?.averagePrice ?? r.metrics?.price ?? ''
        const sales = r.estimatedMonthlySales != null ? r.estimatedMonthlySales : r.metrics?.monthlySales ?? r.metrics?.salesVolume ?? ''
        const rev = r.estimatedMonthlyRevenue != null ? r.estimatedMonthlyRevenue : ''
        const rating = r.rating != null ? r.rating : r.metrics?.rating ?? ''
        const reviews = r.reviewCount != null ? r.reviewCount : r.metrics?.reviewCount ?? ''
        const comp = r.competitionLevel || (r.metrics?.competitorCount ? `${r.metrics.competitorCount} sellers` : '')
        const margin = r.estimatedProfitMarginPercent != null ? r.estimatedProfitMarginPercent : r.estimatedMargin ?? ''
        const score = r.opportunityScore ?? ''
        const reason = r.recommendationReason || r.aiNotes || ''
        const url = r.productUrl || r.sourceUrl || ''

        return [
          r.rank || (i + 1),
          `"${title.replace(/"/g, '""')}"`,
          `"${category.replace(/"/g, '""')}"`,
          marketplace,
          price,
          sales,
          rev,
          rating,
          reviews,
          comp,
          margin,
          score,
          `"${reason.replace(/"/g, '""')}"`,
          `"${url.replace(/"/g, '""')}"`,
        ]
      })

      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
      const safeName = `product_recommendations_${reportId.slice(-8)}.csv`
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
    const { categories: rawCategories, category, niche, instructions } = req.body

    // Accept both { categories: [...] } and legacy { category: "..." }
    const categories = Array.isArray(rawCategories) && rawCategories.length
      ? rawCategories.map((c) => c.trim()).filter(Boolean)
      : category?.trim()
        ? [category.trim()]
        : []

    if (!categories.length) {
      return res.status(400).json({ error: 'At least one product category is required' })
    }

    // Check if OPENAI_API is configured
    if (!process.env.OPENAI_API) {
      return res.status(503).json({
        error: 'OpenAI API key is not configured. Please set OPENAI_API in your environment variables.',
      })
    }

    // Create the parent ResearchReport record immediately
    const report = await ResearchReport.create({
      runBy: req.user?.id || null,
      trigger: 'manual',
      params: {
        marketplaces: ['amazon', 'walmart', 'bestbuy', 'ebay', 'tiktok_shop', 'temu', 'aliexpress'],
        categories,
        category: categories[0], // backward compat
        keywords: niche ? [niche] : [],
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

    // Run the agent asynchronously (fire-and-forget, errors are persisted to DB)
    setImmediate(() => {
      runMarketResearch({
        categories,
        niche: niche?.trim() || '',
        instructions: instructions?.trim() || '',
        reportId: report._id,
        user: req.user,
      }).catch((err) => {
        // Error is already persisted in the report document by the agent
        console.error('[research route] Agent run failed:', err.message)
      })
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
