const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute } = require('../../middleware/auth')
const { createRateLimiter } = require('../../middleware/rateLimit')
const SupportPolicy = require('../../models/SupportPolicy')
const SupportFaq = require('../../models/SupportFaq')
const Order = require('../../models/Order')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const Conversation2 = require('../../models/conversation_2')
const Message2 = require('../../models/message_2')
const supportLimits = require('../../config/supportLimits')
const { runSupportAgent } = require('../../agent/CustomerSupportAgent')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('customer-support'))

const SANDBOX_CHANNEL = 'sandbox'
const VALID_MARKETPLACES = ['ebay', 'tiktok_shop', 'temu', 'sandbox', 'manual']
const VALID_STATUSES = ['open', 'escalated', 'closed', 'locked']

/**
 * Sandbox conversations include legacy rows created before `channel` existed.
 */
function sandboxClause() {
  return { $or: [{ channel: SANDBOX_CHANNEL }, { channel: { $exists: false } }] }
}

/**
 * Super admins see every sandbox thread. Everyone else sees threads for shops
 * they can access, plus their own sandbox threads (which may have no shop).
 */
function scopeClause(req) {
  if (req.authUser?.role === 'super_admin') return null
  const allowed = req.allowedShopIds || []
  return {
    $or: [{ shopId: { $in: allowed } }, { createdBy: req.authUser?._id }],
  }
}

function conversationFilter(req, extra = {}) {
  const clauses = [sandboxClause()]
  const scope = scopeClause(req)
  if (scope) clauses.push(scope)
  return { ...extra, $and: clauses }
}

function validObjectId(value) {
  return mongoose.isValidObjectId(value)
}

function isTestProduct(product) {
  const title = String(product?.title || '')
  const sku = String(product?.sku || '')
  return /test listing|do not bid|do not buy/i.test(title) || sku === '{sku}'
}

function isTestOrder(order) {
  return (order?.items || []).some((item) => /test listing|do not bid|do not buy/i.test(String(item?.title || '')))
}

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
    console.error('[Support] overview failed:', err)
    res.status(500).json({ error: 'Failed to load support overview' })
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
    console.error('[Support] policies failed:', err)
    res.status(500).json({ error: 'Failed to load policies' })
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
    console.error('[Support] faqs failed:', err)
    res.status(500).json({ error: 'Failed to load FAQs' })
  }
})

// ─── GET /api/support/sandbox/context — real orders + products for the buyer UI ──
router.get('/sandbox/context', async (req, res) => {
  try {
    const isSuperAdmin = req.authUser?.role === 'super_admin'
    const allowedShopIds = req.allowedShopIds || []

    const orderFilter = isSuperAdmin ? {} : { shopId: { $in: allowedShopIds } }

    const [orders, products] = await Promise.all([
      Order.find(orderFilter)
        .sort({ placedAt: -1 })
        .limit(60)
        .select('externalOrderId shopId marketplace status buyer.name items.productId items.title items.sku totals placedAt')
        .lean(),
      (async () => {
        const filter = { status: 'active' }
        if (!isSuperAdmin) {
          const productIds = await Listing.find({ shopId: { $in: allowedShopIds } }).distinct('productId')
          filter._id = { $in: productIds }
        }
        return Product.find(filter)
          .sort({ title: 1 })
          .limit(200)
          .select('sku title category basePrice currency stock brand')
          .lean()
      })(),
    ])

    // Hide sync/test records and collapse duplicate marketplace order IDs so
    // the simulation only shows one row per real order.
    const ordersByRef = new Map()
    for (const order of orders) {
      if (isTestOrder(order)) continue
      const key = `${order.marketplace || 'unknown'}:${order.externalOrderId}`
      const existing = ordersByRef.get(key)
      if (!existing) {
        ordersByRef.set(key, order)
        continue
      }
      const orderHasProduct = (order.items || []).some((item) => item.productId)
      const existingHasProduct = (existing.items || []).some((item) => item.productId)
      if (orderHasProduct && !existingHasProduct) ordersByRef.set(key, order)
    }
    const visibleOrders = Array.from(ordersByRef.values()).slice(0, 40)
    const visibleProducts = products.filter((product) => !isTestProduct(product))

    // Products do not store a shopId, so expose the first listing's shop for
    // the buyer sandbox (used to scope product/order tools).
    const shopByProduct = new Map()
    if (visibleProducts.length) {
      const listings = await Listing.find({ productId: { $in: visibleProducts.map((p) => p._id) } })
        .select('productId shopId')
        .lean()
      for (const listing of listings) {
        const key = String(listing.productId)
        if (!shopByProduct.has(key)) shopByProduct.set(key, String(listing.shopId))
      }
    }

    res.json({
      orders: visibleOrders.map((order) => ({
        ...order,
        _id: String(order._id),
        shopId: order.shopId ? String(order.shopId) : null,
      })),
      products: visibleProducts.map((product) => ({
        ...product,
        _id: String(product._id),
        shopId: shopByProduct.get(String(product._id)) || null,
      })),
    })
  } catch (err) {
    console.error('[Support] sandbox context failed:', err)
    res.status(500).json({ error: 'Failed to load sandbox context' })
  }
})

// ─── POST /api/support/chat/buyer/message — Buyer sends message, AI responds ──
const buyerIpLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: supportLimits.rateLimit.perIpPerMin,
  keyGenerator: (req) => `ip:${req.ip}`,
  message: 'Too many support messages from this connection. Please wait a minute and try again.',
})

const buyerSessionLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: supportLimits.rateLimit.perSessionPerMin,
  keyGenerator: (req) => `session:${req.body?.conversationId || req.ip}`,
  message: 'This conversation is sending messages too quickly. Please wait a moment.',
})

const buyerHourlyLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: supportLimits.rateLimit.perSessionPerHour,
  keyGenerator: (req) => `hour:${req.body?.conversationId || req.ip}`,
  message: 'This conversation has reached its hourly message limit. Please contact support directly.',
})

router.post('/chat/buyer/message', buyerIpLimiter, buyerSessionLimiter, buyerHourlyLimiter, async (req, res) => {
  try {
    const {
      conversationId,
      text,
      senderName,
      orderRef,
      productId,
      shopId,
      marketplace,
    } = req.body || {}

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' })
    }
    if (text.length > supportLimits.maxMessageChars) {
      return res.status(400).json({
        error: `Message exceeds the maximum length (${supportLimits.maxMessageChars} characters).`,
      })
    }
    if (senderName && (typeof senderName !== 'string' || senderName.length > 80)) {
      return res.status(400).json({ error: 'Buyer name must be 80 characters or fewer.' })
    }
    if (orderRef && (typeof orderRef !== 'string' || orderRef.length > 80)) {
      return res.status(400).json({ error: 'Order reference is invalid.' })
    }
    if (marketplace && !VALID_MARKETPLACES.includes(marketplace)) {
      return res.status(400).json({ error: 'Unknown marketplace channel.' })
    }
    if (productId && !validObjectId(productId)) {
      return res.status(400).json({ error: 'Invalid product ID.' })
    }
    if (shopId && !validObjectId(shopId)) {
      return res.status(400).json({ error: 'Invalid shop ID.' })
    }

    const isSuperAdmin = req.authUser?.role === 'super_admin'
    if (shopId && !isSuperAdmin && !(req.allowedShopIds || []).some((id) => String(id) === String(shopId))) {
      return res.status(403).json({ error: 'You do not have access to this shop.' })
    }

    if (conversationId) {
      if (!validObjectId(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID.' })
      }
      const existing = await Conversation2.findOne(
        conversationFilter(req, { _id: conversationId }),
      )
        .select('_id')
        .lean()
      if (!existing) {
        return res.status(404).json({ error: 'Conversation not found in this sandbox.' })
      }
    }

    const result = await runSupportAgent({
      conversationId: conversationId || null,
      text: text.trim(),
      senderName: senderName || 'Buyer',
      orderRef: orderRef || '',
      productId: productId || null,
      shopId: shopId || null,
      marketplace: marketplace || 'ebay',
      createdBy: req.authUser?._id || null,
      channel: SANDBOX_CHANNEL,
    })

    res.json(result)
  } catch (err) {
    console.error('[SupportChat] Error in runSupportAgent:', err)
    res.status(500).json({ error: 'Support agent failed to process this message. Please try again.' })
  }
})

// ─── GET /api/support/chat/conversations — Seller view (sandbox only) ────────
router.get('/chat/conversations', async (req, res) => {
  try {
    const extra = {}
    // The buyer page passes ?mine=1 so it always resumes its own thread.
    if (req.query.mine === '1') extra.createdBy = req.authUser?._id || null

    const conversations = await Conversation2.find(conversationFilter(req, extra))
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean()

    res.json(conversations)
  } catch (err) {
    console.error('[Support] conversations failed:', err)
    res.status(500).json({ error: 'Failed to load conversations' })
  }
})

// ─── GET /api/support/chat/conversations/:id/messages — Thread ───────────────
router.get('/chat/conversations/:id/messages', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
    }

    const conversation = await Conversation2.findOne(
      conversationFilter(req, { _id: req.params.id }),
    )
      .select('_id')
      .lean()
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found in this sandbox.' })
    }

    const messages = await Message2.find({ conversationId: req.params.id })
      .sort({ sentAt: 1 })
      .limit(200)
      .lean()

    res.json(messages)
  } catch (err) {
    console.error('[Support] messages failed:', err)
    res.status(500).json({ error: 'Failed to load the conversation' })
  }
})

// ─── POST /api/support/chat/conversations/:id/reply — Human agent reply ──────
router.post('/chat/conversations/:id/reply', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
    }

    const { text } = req.body || {}
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Reply text is required' })
    }
    if (text.length > 4000) {
      return res.status(400).json({ error: 'Reply is too long.' })
    }

    const conversation = await Conversation2.findOne(
      conversationFilter(req, { _id: req.params.id }),
    )
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found in this sandbox.' })
    }

    const agentMessage = await Message2.create({
      conversationId: conversation._id,
      shopId: conversation.shopId,
      senderType: 'agent',
      senderUserId: req.authUser?._id || null,
      senderName: req.authUser?.name || 'Support Agent',
      text: text.trim(),
      deliveryStatus: 'sent',
      sentAt: new Date(),
    })

    await Conversation2.findByIdAndUpdate(conversation._id, {
      $set: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.trim().slice(0, 100),
        // A human replying takes over the thread; the buyer no longer gets an
        // automatic AI answer until the seller re-enables it.
        aiEnabled: false,
      },
      $inc: { messageCount: 1 },
    })

    res.json({ success: true, message: agentMessage, aiEnabled: false })
  } catch (err) {
    console.error('[Support] reply failed:', err)
    res.status(500).json({ error: 'Failed to send the reply' })
  }
})

// ─── PATCH /api/support/chat/conversations/:id — Status / AI toggle ──────────
router.patch('/chat/conversations/:id', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
    }

    const { aiEnabled, status } = req.body || {}
    const update = {}

    if (typeof aiEnabled === 'boolean') update.aiEnabled = aiEnabled
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid conversation status.' })
      }
      update.status = status
      if (status === 'open') {
        update.lockedUntil = null
        update.offTopicStrikes = 0
      }
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update.' })
    }

    const updated = await Conversation2.findOneAndUpdate(
      conversationFilter(req, { _id: req.params.id }),
      { $set: update },
      { new: true },
    )
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found in this sandbox.' })
    }

    res.json(updated)
  } catch (err) {
    console.error('[Support] conversation update failed:', err)
    res.status(500).json({ error: 'Failed to update the conversation' })
  }
})

// ─── POST /api/support/chat/reset-sandbox — Clear sandbox threads only ───────
router.post('/chat/reset-sandbox', async (req, res) => {
  try {
    const conversations = await Conversation2.find(conversationFilter(req)).select('_id').lean()
    const ids = conversations.map((conversation) => conversation._id)

    if (ids.length) {
      await Message2.deleteMany({ conversationId: { $in: ids } })
      await Conversation2.deleteMany({ _id: { $in: ids } })
    }

    res.json({
      success: true,
      conversationsDeleted: ids.length,
      message: 'Support chat sandbox reset successfully.',
    })
  } catch (err) {
    console.error('[Support] sandbox reset failed:', err)
    res.status(500).json({ error: 'Failed to reset the sandbox' })
  }
})

module.exports = router
