const express = require('express')
const { requireAuth, loadAccess, requireMainRoute } = require('../../middleware/auth')
const SupportPolicy = require('../../models/SupportPolicy')
const SupportFaq = require('../../models/SupportFaq')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('customer-support'))

// ─── GET /api/support/overview — knowledge-base stats for the settings page ──
router.get('/overview', async (req, res) => {
  try {
    const [policies, faqs, policiesByCategory, faqsByCategory, latestPolicy, latestFaq] = await Promise.all([
      SupportPolicy.countDocuments({ status: 'active' }),
      SupportFaq.countDocuments({ status: 'active' }),
      SupportPolicy.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      SupportFaq.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      SupportPolicy.findOne({ status: 'active' }).sort({ updatedAt: -1 }).select('updatedAt'),
      SupportFaq.findOne({ status: 'active' }).sort({ updatedAt: -1 }).select('updatedAt'),
    ])

    const timestamps = [latestPolicy?.updatedAt, latestFaq?.updatedAt].filter(Boolean)
    const lastUpdated = timestamps.length ? new Date(Math.max(...timestamps.map((t) => t.getTime()))) : null

    res.json({
      policies,
      faqs,
      categories: new Set([...policiesByCategory, ...faqsByCategory].map((row) => row._id)).size,
      policiesByCategory: policiesByCategory.map((row) => ({ category: row._id, count: row.count })),
      faqsByCategory: faqsByCategory.map((row) => ({ category: row._id, count: row.count })),
      lastUpdated,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/support/policies — full policy list (optional ?category=) ──────
router.get('/policies', async (req, res) => {
  try {
    const filter = { status: req.query.status || 'active' }
    if (req.query.category) filter.category = req.query.category
    const policies = await SupportPolicy.find(filter).sort({ category: 1, title: 1 }).limit(200).lean()
    res.json(policies)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/support/faqs — full FAQ list (optional ?category=) ─────────────
router.get('/faqs', async (req, res) => {
  try {
    const filter = { status: req.query.status || 'active' }
    if (req.query.category) filter.category = req.query.category
    const faqs = await SupportFaq.find(filter).sort({ category: 1, question: 1 }).limit(300).lean()
    res.json(faqs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
