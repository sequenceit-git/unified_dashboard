const express = require('express')
const { requireAuth, loadAccess, requireRole } = require('../../middleware/auth')
const { discoveryAgent } = require('../../agent')
const ResearchReport = require('../../models/ResearchReport')
const Product = require('../../models/Product')
const { paging } = require('../../utils/query')

const router = express.Router()

router.use(requireAuth, loadAccess)

// GET /api/discovery/overview — stats for the discovery bot
router.get('/overview', async (req, res) => {
  try {
    const [totalReports, botProducts, latestReport] = await Promise.all([
      ResearchReport.countDocuments(),
      Product.countDocuments({ source: 'research_bot' }),
      ResearchReport.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean(),
    ])

    const totalOpps = latestReport?.opportunities?.length || 0
    const highPotential = latestReport?.opportunities?.filter((o) => o.opportunityScore >= 80).length || 0

    res.json({
      totalReports,
      productsAddedFromBot: botProducts,
      latestOpportunitiesCount: totalOpps,
      highPotentialCount: highPotential,
      lastRunAt: latestReport?.createdAt || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/discovery/trending?category=
router.get('/trending', async (req, res) => {
  try {
    const data = await discoveryAgent.getTrending({
      category: req.query.category,
      limit: Number(req.query.limit) || 12,
    })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/discovery/reports?page=&limit=
router.get('/reports', async (req, res) => {
  try {
    const pg = paging(req, 10)
    const [total, reports] = await Promise.all([
      ResearchReport.countDocuments(),
      ResearchReport.find()
        .select('params status summary opportunities startedAt finishedAt createdAt')
        .sort({ createdAt: -1 })
        .skip(pg.skip)
        .limit(pg.limit)
        .lean(),
    ])

    const formatted = reports.map((r) => ({
      _id: r._id,
      category: r.params?.category || 'All',
      marketplaces: r.params?.marketplaces || [],
      status: r.status,
      summary: r.summary,
      opportunityCount: r.opportunities?.length || 0,
      createdAt: r.createdAt,
    }))

    res.json({
      data: formatted,
      page: pg.page,
      limit: pg.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pg.limit)),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/discovery/reports/:id
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await ResearchReport.findById(req.params.id).populate('opportunities.addedProductId')
    if (!report) return res.status(404).json({ error: 'Report not found' })
    res.json(report)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/discovery/run — execute AI Market Research Bot
router.post('/run', requireRole('super_admin'), async (req, res) => {
  try {
    const { category, keywords, marketplaces } = req.body
    const report = await discoveryAgent.runDiscovery({
      category: category || 'All',
      keywords: Array.isArray(keywords) ? keywords : keywords ? [keywords] : [],
      marketplaces: Array.isArray(marketplaces) && marketplaces.length ? marketplaces : ['ebay'],
      user: req.authUser || req.user,
    })
    res.status(201).json(report)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/discovery/add-to-catalog — convert opportunity to catalog product
router.post('/add-to-catalog', requireRole('super_admin'), async (req, res) => {
  try {
    const { reportId, rank, title, price, stock } = req.body
    if (!reportId || !rank) {
      return res.status(400).json({ error: 'reportId and rank are required' })
    }

    const result = await discoveryAgent.addOpportunityToCatalog({
      reportId,
      rank: Number(rank),
      user: req.authUser || req.user,
      customOptions: { title, price, stock },
    })

    res.status(201).json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
