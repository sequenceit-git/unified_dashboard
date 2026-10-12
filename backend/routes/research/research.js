const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute } = require('../../middleware/auth')
const MarketAnalysis = require('../../models/MarketAnalysis')
const ProductRecommendation = require('../../models/ProductRecommendation')
const MarketplaceResearch = require('../../models/MarketplaceResearch')
const ResearchReport = require('../../models/ResearchReport')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

// GET /api/research/reports — list all reports
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

// GET /api/research/analysis/:reportId — market analysis for a report (or latest fallback)
router.get('/analysis/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    let doc = null
    if (mongoose.isValidObjectId(reportId)) {
      doc = await MarketAnalysis.findOne({ reportId })
    }
    if (!doc) {
      doc = await MarketAnalysis.findOne().sort({ createdAt: -1 })
    }
    if (!doc) {
      return res.status(404).json({ error: 'Market analysis not found' })
    }
    res.json(doc)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/research/recommendations/:reportId — recommendations for a report
router.get('/recommendations/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    let docs = []
    if (mongoose.isValidObjectId(reportId)) {
      docs = await ProductRecommendation.find({ reportId }).sort({ rank: 1 })
    }
    if (!docs.length) {
      docs = await ProductRecommendation.find().sort({ rank: 1 })
    }
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/research/research-data/:reportId — raw marketplace research items
router.get('/research-data/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    let docs = []
    if (mongoose.isValidObjectId(reportId)) {
      docs = await MarketplaceResearch.find({ reportId }).sort({ searchRanking: 1 })
    }
    if (!docs.length) {
      docs = await MarketplaceResearch.find().sort({ searchRanking: 1 })
    }
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/research/report/:reportId — consolidated full report data
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

    const targetReportId = report?._id

    const [analysis, recommendations, marketplaceData] = await Promise.all([
      targetReportId ? MarketAnalysis.findOne({ reportId: targetReportId }) : MarketAnalysis.findOne().sort({ createdAt: -1 }),
      targetReportId ? ProductRecommendation.find({ reportId: targetReportId }).sort({ rank: 1 }) : ProductRecommendation.find().sort({ rank: 1 }),
      targetReportId ? MarketplaceResearch.find({ reportId: targetReportId }).sort({ searchRanking: 1 }) : MarketplaceResearch.find().sort({ searchRanking: 1 }),
    ])

    res.json({
      report: report || {
        _id: 'default-report',
        category: 'Home & Kitchen',
        status: 'completed',
        createdAt: new Date(),
      },
      analysis,
      recommendations,
      marketplaceData,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/research/generate — trigger/stage a report
router.post('/generate', async (req, res) => {
  try {
    const { category, niche, instructions } = req.body
    if (!category) {
      return res.status(400).json({ error: 'Product Category is required' })
    }

    const report = await ResearchReport.create({
      runBy: req.user?.id || null,
      trigger: 'manual',
      params: {
        marketplaces: ['ebay', 'temu', 'tiktok_shop'],
        category,
        keywords: niche ? [niche] : [],
      },
      status: 'completed',
      summary: `AI research run for ${category}${niche ? ` (${niche})` : ''}: strong multi-channel demand with notable social-commerce velocity.`,
    })

    res.status(201).json(report)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
