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

// ─── CHAT API (Customer Support AI Agent v2) ──────────────────────────────
const Conversation2 = require('../../models/conversation_2')
const Message2 = require('../../models/message_2')
const { runSupportAgent } = require('../../agent/CustomerSupportAgent')

// POST /api/support/chat/buyer/message — Buyer sends message, AI agent responds
router.post('/chat/buyer/message', async (req, res) => {
  try {
    const { conversationId, text, senderName, orderRef, marketplace } = req.body
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' })
    }

    const result = await runSupportAgent({
      conversationId,
      text: text.trim(),
      senderName: senderName || 'Buyer',
      orderRef: orderRef || '',
      marketplace: marketplace || 'ebay',
    })

    res.json(result)
  } catch (err) {
    console.error('[SupportChat] Error in runSupportAgent:', err)
    res.status(500).json({ error: err.message || 'Support agent failed to process message' })
  }
})

// GET /api/support/chat/conversations — List all active conversations for Seller View
router.get('/chat/conversations', async (req, res) => {
  try {
    const conversations = await Conversation2.find({})
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean()
    res.json(conversations)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/support/chat/conversations/:id/messages — Get message thread
router.get('/chat/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await Message2.find({ conversationId: req.params.id })
      .sort({ sentAt: 1 })
      .limit(100)
      .lean()
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/support/chat/conversations/:id/reply — Human agent sends manual reply
router.post('/chat/conversations/:id/reply', async (req, res) => {
  try {
    const { text } = req.body
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Reply text is required' })
    }

    const conversation = await Conversation2.findById(req.params.id)
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const agentMessage = await Message2.create({
      conversationId: conversation._id,
      shopId: conversation.shopId,
      senderType: 'agent',
      senderUserId: req.user?._id || null,
      senderName: req.user?.name || 'Support Agent',
      text: text.trim(),
      deliveryStatus: 'sent',
      sentAt: new Date(),
    })

    await Conversation2.findByIdAndUpdate(conversation._id, {
      $set: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.trim().slice(0, 100),
      },
      $inc: { messageCount: 1 },
    })

    res.json({ success: true, message: agentMessage })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/support/chat/conversations/:id — Update status or toggle AI
router.patch('/chat/conversations/:id', async (req, res) => {
  try {
    const { aiEnabled, status } = req.body
    const update = {}
    if (typeof aiEnabled === 'boolean') update.aiEnabled = aiEnabled
    if (status) update.status = status

    const updated = await Conversation2.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/support/chat/reset-sandbox — Clear test conversations
router.post('/chat/reset-sandbox', async (req, res) => {
  try {
    await Promise.all([
      Conversation2.deleteMany({ marketplace: { $in: ['ebay', 'sandbox', 'manual'] } }),
      Message2.deleteMany({}),
    ])
    res.json({ success: true, message: 'Support chat sandbox reset successfully.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
