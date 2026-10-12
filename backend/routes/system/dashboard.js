const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, shopFilter } = require('../../middleware/auth')

const resources = {
  users: require('../../models/User'),
  shops: require('../../models/Shop'),
  products: require('../../models/Product'),
  listings: require('../../models/Listing'),
  inventory_logs: require('../../models/InventoryLog'),
  orders: require('../../models/Order'),
  customers: require('../../models/Customer'),
  conversations: require('../../models/Conversation'),
  messages: require('../../models/Message'),
  message_templates: require('../../models/MessageTemplate'),
  research_reports: require('../../models/ResearchReport'),
  marketplace_researches: require('../../models/MarketplaceResearch'),
  product_recommendations: require('../../models/ProductRecommendation'),
  market_analyses: require('../../models/MarketAnalysis'),
  sync_logs: require('../../models/SyncLog'),
  notifications: require('../../models/Notification'),
  audit_logs: require('../../models/AuditLog'),
}

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('dashboard'))

// GET /api/dashboard/overview — document counts per collection
router.get('/overview', async (req, res) => {
  try {
    const counts = {}
    for (const [name, model] of Object.entries(resources)) {
      counts[name] = await model.countDocuments(shopFilter(req, model))
    }
    res.json({ db: 'unified_dashboard', counts })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

for (const [name, model] of Object.entries(resources)) {
  // GET /api/dashboard/<collection>?limit=50
  router.get(`/${name}`, async (req, res) => {
    try {
      if (req.user.role === 'sub_admin' && !model.schema.path('shopId')) {
        return res.json([])
      }
      const limit = Math.min(Number(req.query.limit) || 50, 200)
      const docs = await model
        .find(shopFilter(req, model))
        .sort({ createdAt: -1 })
        .limit(limit)
      res.json(docs)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/dashboard/<collection>
  router.post(`/${name}`, async (req, res) => {
    try {
      const body = { ...req.body }
      // sub_admin can only write into their own shop
      if (req.user.role === 'sub_admin' && model.schema.path('shopId')) {
        body.shopId = req.allowedShopIds[0]
      }
      const doc = await model.create(body)
      res.status(201).json(doc)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // GET /api/dashboard/<collection>/:id
  router.get(`/${name}/:id`, async (req, res) => {
    try {
      const doc = await model.findOne({ _id: req.params.id, ...shopFilter(req, model) })
      if (!doc) return res.status(404).json({ error: 'Not found' })
      res.json(doc)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })
}

module.exports = router
