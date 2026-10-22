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
const DEFAULT_PERSONA = 'jane_doe'
const SUPPORT_PERSONAS = {
  jane_doe: 'Jane Doe',
  john_dutch: 'John Dutch',
}

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

function normalizePersona(value) {
  const persona = String(value || DEFAULT_PERSONA).trim().toLowerCase()
  return SUPPORT_PERSONAS[persona] ? persona : null
}

function personaClause(persona) {
  if (!persona) return null
  // Legacy sandbox rows predate sandboxPersona and belong to Jane.
  if (persona === DEFAULT_PERSONA) {
    return { $or: [{ sandboxPersona: DEFAULT_PERSONA }, { sandboxPersona: { $exists: false } }] }
  }
  return { sandboxPersona: persona }
}

function productClause(productId) {
  if (productId === undefined || productId === null || productId === '') return null
  if (productId === 'none') return { productId: null }
  return { productId }
}

function conversationFilter(req, extra = {}, scope = {}) {
  const clauses = [sandboxClause()]
  const access = scopeClause(req)
  if (access) clauses.push(access)

  const persona = personaClause(scope.persona)
  if (persona) clauses.push(persona)
  if (scope.marketplace) clauses.push({ marketplace: scope.marketplace })
  const product = productClause(scope.productId)
  if (product) clauses.push(product)

  return { ...extra, $and: clauses }
}

function validObjectId(value) {
  return mongoose.isValidObjectId(value)
}

function conversationContext(conversation) {
  return {
    persona: conversation.sandboxPersona || DEFAULT_PERSONA,
    marketplace: conversation.marketplace || 'ebay',
    productId: conversation.productId ? String(conversation.productId) : '',
  }
}

function conversationMatchesContext(conversation, { persona, marketplace, productId }) {
  const current = conversationContext(conversation)
  return (
    current.persona === persona &&
    current.marketplace === marketplace &&
    current.productId === String(productId || '')
  )
}

/**
 * Buyer messages are aggregated per chat channel (persona + marketplace +
 * product). Each channel owns an independent timer, queue and in-flight turn,
 * so one slow AI reply never batches or blocks another product thread.
 */
const buyerBatches = new Map()

function enqueueBuyerBatch(key, payload) {
  return new Promise((resolve, reject) => {
    let batch = buyerBatches.get(key)
    if (!batch) {
      batch = { items: [], firstAt: Date.now(), timer: null, processing: false }
      buyerBatches.set(key, batch)
    }

    batch.items.push({ payload, resolve, reject })

    const elapsed = Date.now() - batch.firstAt
    if (elapsed >= supportLimits.debounceMaxWaitMs) {
      flushBuyerBatch(key, batch)
      return
    }

    if (batch.timer) clearTimeout(batch.timer)
    const wait = Math.min(supportLimits.debounceWindowMs, supportLimits.debounceMaxWaitMs - elapsed)
    batch.timer = setTimeout(() => flushBuyerBatch(key, batch), wait)
    batch.timer.unref?.()
  })
}

async function flushBuyerBatch(key, batch) {
  if (batch.timer) {
    clearTimeout(batch.timer)
    batch.timer = null
  }
  if (batch.processing) return
  if (!batch.items.length) {
    buyerBatches.delete(key)
    return
  }

  batch.processing = true
  const items = batch.items
  batch.items = []
  batch.firstAt = Date.now()
  const first = items[0]?.payload

  try {
    const result = await runSupportAgent({
      conversationId: first.conversationId,
      texts: items.map((item) => item.payload.text),
      senderName: first.senderName,
      persona: first.persona,
      orderRef: first.orderRef,
      productId: first.productId,
      shopId: first.shopId,
      marketplace: first.marketplace,
      createdBy: first.createdBy,
      channel: SANDBOX_CHANNEL,
    })
    for (const item of items) item.resolve(result)
  } catch (err) {
    console.error('[SupportChat] Batched agent run failed:', err)
    for (const item of items) item.reject(err)
  } finally {
    batch.processing = false
    if (batch.items.length) {
      if (batch.timer) clearTimeout(batch.timer)
      batch.firstAt = Date.now()
      batch.timer = setTimeout(() => flushBuyerBatch(key, batch), supportLimits.debounceWindowMs)
      batch.timer.unref?.()
    } else {
      buyerBatches.delete(key)
    }
  }
}

function buyerRateKey(req) {
  const body = req.body || {}
  if (body.conversationId) return `convo:${body.conversationId}`
  const persona = normalizePersona(body.persona) || DEFAULT_PERSONA
  const marketplace = body.marketplace || 'ebay'
  return `draft:${req.authUser?._id || req.ip}:${persona}:${marketplace}:${body.productId || 'none'}`
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
  keyGenerator: (req) => `session:${buyerRateKey(req)}`,
  message: 'This conversation is sending messages too quickly. Please wait a moment.',
})

const buyerHourlyLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: supportLimits.rateLimit.perSessionPerHour,
  keyGenerator: (req) => `hour:${buyerRateKey(req)}`,
  message: 'This conversation has reached its hourly message limit. Please contact support directly.',
})

router.post('/chat/buyer/message', buyerIpLimiter, buyerSessionLimiter, buyerHourlyLimiter, async (req, res) => {
  try {
    const {
      conversationId,
      text,
      orderRef,
      productId,
      shopId,
    } = req.body || {}

    const persona = normalizePersona(req.body?.persona)
    if (!persona) {
      return res.status(400).json({ error: 'Unknown sandbox buyer persona.' })
    }
    const senderName = SUPPORT_PERSONAS[persona]
    const marketplace = req.body?.marketplace || 'ebay'

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' })
    }
    if (text.length > supportLimits.maxMessageChars) {
      return res.status(400).json({
        error: `Message exceeds the maximum length (${supportLimits.maxMessageChars} characters).`,
      })
    }
    if (orderRef && (typeof orderRef !== 'string' || orderRef.length > 80)) {
      return res.status(400).json({ error: 'Order reference is invalid.' })
    }
    if (!VALID_MARKETPLACES.includes(marketplace)) {
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
        .select('_id sandboxPersona marketplace productId')
        .lean()
      if (!existing) {
        return res.status(404).json({ error: 'Conversation not found in this sandbox.' })
      }
      if (!conversationMatchesContext(existing, { persona, marketplace, productId })) {
        return res.status(409).json({
          error: 'This chat belongs to a different buyer or product channel. Switch back to that product or start a new conversation.',
        })
      }
    }

    // Messages arriving inside the quiet window are stored individually and
    // answered with one AI turn. Requests without a conversation share a
    // channel-scoped draft key so the first batch creates only one thread.
    const batchKey = conversationId
      ? `convo:${conversationId}`
      : `draft:${req.authUser?._id || req.ip}:${persona}:${marketplace}:${productId || 'none'}:${shopId || 'none'}:${orderRef || 'none'}`

    const result = await enqueueBuyerBatch(batchKey, {
      conversationId: conversationId || null,
      text: text.trim(),
      senderName,
      persona,
      orderRef: orderRef || '',
      productId: productId || null,
      shopId: shopId || null,
      marketplace,
      createdBy: req.authUser?._id || null,
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

    const scope = {}
    if (req.query.persona !== undefined) {
      const persona = normalizePersona(req.query.persona)
      if (!persona) return res.status(400).json({ error: 'Unknown sandbox buyer persona.' })
      scope.persona = persona
    }
    if (req.query.marketplace) {
      if (!VALID_MARKETPLACES.includes(req.query.marketplace)) {
        return res.status(400).json({ error: 'Unknown marketplace channel.' })
      }
      scope.marketplace = req.query.marketplace
    }
    if (req.query.productId !== undefined) {
      const requested = String(req.query.productId || 'none')
      if (requested !== 'none' && !validObjectId(requested)) {
        return res.status(400).json({ error: 'Invalid product ID.' })
      }
      scope.productId = requested
    }

    const conversations = await Conversation2.find(conversationFilter(req, extra, scope))
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean()

    // Attach the product title so the seller can tell per-product threads apart.
    const productIds = [...new Set(conversations.map((c) => c.productId).filter(Boolean).map(String))]
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select('title sku').lean()
      : []
    const productById = new Map(products.map((product) => [String(product._id), product]))

    // The seller view only lists product threads where the buyer actually sent
    // something. Count real customer messages, not AI/seller replies.
    const conversationIds = conversations.map((c) => c._id)
    const customerCounts = conversationIds.length
      ? await Message2.aggregate([
          { $match: { conversationId: { $in: conversationIds }, senderType: 'customer' } },
          { $group: { _id: '$conversationId', count: { $sum: 1 } } },
        ])
      : []
    const customerCountById = new Map(
      customerCounts.map((row) => [String(row._id), row.count || 0]),
    )

    res.json(
      conversations.map((conversation) => {
        const product = conversation.productId ? productById.get(String(conversation.productId)) : null
        const persona = conversation.sandboxPersona || DEFAULT_PERSONA
        const customerMessageCount = customerCountById.get(String(conversation._id)) || 0
        return {
          ...conversation,
          productId: conversation.productId ? String(conversation.productId) : null,
          productTitle: product?.title || null,
          productSku: product?.sku || null,
          sandboxPersona: persona,
          personaName: SUPPORT_PERSONAS[persona] || null,
          customerMessageCount,
          hasCustomerMessage: customerMessageCount > 0,
        }
      }),
    )
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
