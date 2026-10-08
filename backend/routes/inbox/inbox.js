const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, shopFilter } = require('../../middleware/auth')
const { paging, paged } = require('../../utils/query')
const Conversation = require('../../models/Conversation')
const Message = require('../../models/Message')
const MessageTemplate = require('../../models/MessageTemplate')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('inbox'))

// GET /api/inbox/conversations?shopId=&status=&page=&limit=
router.get('/conversations', async (req, res) => {
  try {
    const filter = { ...shopFilter(req, Conversation) }
    if (req.query.shopId) {
      if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === req.query.shopId)) {
        return res.status(403).json({ error: 'You do not have access to this shop' })
      }
      filter.shopId = req.query.shopId
    }
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    const pg = paging(req)
    const out = await paged(Conversation, filter, pg, { lastMessageAt: -1 })
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/inbox/conversations/:id — thread + messages
router.get('/conversations/:id', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, ...shopFilter(req, Conversation) })
      .populate('customerId', 'name email')
    if (!convo) return res.status(404).json({ error: 'Not found' })
    const messages = await Message.find({ conversationId: convo._id }).sort({ sentAt: 1 }).limit(200)
    res.json({ ...convo.toObject(), messages })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/inbox/conversations/:id/messages — placeholder reply (local-only)
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, ...shopFilter(req, Conversation) })
    if (!convo) return res.status(404).json({ error: 'Not found' })
    if (!req.body.text) return res.status(400).json({ error: 'text required' })
    // PLACEHOLDER: stored locally with deliveryStatus `sent`.
    // Real delivery to eBay/Temu/TikTok needs §2.1 marketplace APIs.
    const msg = await Message.create({
      conversationId: convo._id,
      shopId: convo.shopId,
      direction: 'outbound',
      senderType: req.user.role === 'super_admin' ? 'agent' : 'agent',
      senderUserId: req.user.id,
      text: req.body.text,
      deliveryStatus: 'sent',
      sentAt: new Date(),
    })
    convo.lastMessageAt = new Date()
    convo.lastMessagePreview = req.body.text.slice(0, 100)
    convo.unreadCount = 0
    await convo.save()
    res.status(201).json(msg)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/inbox/conversations/:id — { status, aiEnabled }
router.patch('/conversations/:id', async (req, res) => {
  try {
    const { status, aiEnabled } = req.body
    const doc = await Conversation.findOneAndUpdate(
      { _id: req.params.id, ...shopFilter(req, Conversation) },
      {
        ...(status ? { status } : {}),
        ...(aiEnabled !== undefined ? { aiEnabled } : {}),
      },
      { new: true, runValidators: true },
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/inbox/templates?shopId=
router.get('/templates', async (req, res) => {
  try {
    const or = [{ shopId: null }]
    const shopId = req.query.shopId || null
    if (req.user.role === 'sub_admin' && shopId && !req.allowedShopIds.some((id) => String(id) === shopId)) {
      return res.status(403).json({ error: 'You do not have access to this shop' })
    }
    if (shopId) or.push({ shopId })
    res.json(await MessageTemplate.find({ $or: or }).sort({ createdAt: -1 }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/inbox/templates
router.post('/templates', async (req, res) => {
  try {
    const body = { ...req.body, createdBy: req.user.id }
    if (req.user.role === 'sub_admin') {
      if (body.shopId && !req.allowedShopIds.some((id) => String(id) === body.shopId)) {
        return res.status(403).json({ error: 'You do not have access to this shop' })
      }
      body.shopId = body.shopId || req.allowedShopIds[0]
    }
    res.status(201).json(await MessageTemplate.create(body))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
