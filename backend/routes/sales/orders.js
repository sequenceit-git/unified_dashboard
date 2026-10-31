const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Order = require('../../models/Order')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')
const syncQueue = require('../../services/syncQueue')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('orders'))


const SORTABLE = ['placedAt', 'totals.total', 'createdAt', 'status']

// GET /api/orders?marketplace=&shopId=&status=&q=&from=&to=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const filter = { ...shopFilter(req, Order) }
    if (req.query.marketplace && req.query.marketplace !== 'all') {
      const marketplace = canonicalMarketplace(req.query.marketplace)
      if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
      filter.marketplace = marketplace
    }
    if (req.query.shopId) {
      if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === req.query.shopId)) {
        return res.status(403).json({ error: 'You do not have access to this shop' })
      }
      filter.shopId = req.query.shopId
    }
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    if (req.query.from || req.query.to) {
      filter.placedAt = {}
      if (req.query.from) filter.placedAt.$gte = new Date(req.query.from)
      if (req.query.to) filter.placedAt.$lte = new Date(req.query.to)
    }
    if (req.query.q) {
      const q = req.query.q.trim()
      filter.$or = [
        { externalOrderId: { $regex: q, $options: 'i' } },
        { 'shipping.trackingNumber': { $regex: q, $options: 'i' } },
        { 'buyer.name': { $regex: q, $options: 'i' } },
        { 'buyer.email': { $regex: q, $options: 'i' } },
        { 'items.sku': { $regex: q, $options: 'i' } },
      ]
    }
    const pg = paging(req)
    const out = await paged(Order, filter, pg, sortOf(req, SORTABLE, '-placedAt'))
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Order.findOne({ _id: req.params.id, ...shopFilter(req, Order) })
      .populate('customerId', 'name email phone')
      .populate('shopId', 'name marketplace')
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/orders/sync — pull orders from connected marketplace shops
router.post('/sync', async (req, res) => {
  try {
    const filter = {}
    if (req.user.role === 'sub_admin') {
      filter._id = { $in: req.allowedShopIds }
    } else if (req.body.shopId) {
      filter._id = req.body.shopId
    } else if (req.body.marketplace) {
      const marketplace = canonicalMarketplace(req.body.marketplace)
      if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
      filter.marketplace = marketplace
    }

    const shops = await Shop.find(filter).select('name marketplace')
    const results = await Promise.all(shops.map(async (shop) => ({
      shopId: shop._id,
      shopName: shop.name,
      marketplace: shop.marketplace,
      ...(await syncQueue.enqueue('orders', shop._id, { wait: true })),
    })))

    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/orders/:id/status — { status }
router.patch('/:id/status', async (req, res) => {
  try {
    const doc = await Order.findOneAndUpdate(
      { _id: req.params.id, ...shopFilter(req, Order) },
      { status: req.body.status },
      { new: true, runValidators: true },
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/orders/:id/shipping — { carrier, trackingNumber }
router.patch('/:id/shipping', async (req, res) => {
  try {
    const { carrier, trackingNumber } = req.body
    const doc = await Order.findOneAndUpdate(
      { _id: req.params.id, ...shopFilter(req, Order) },
      {
        ...(carrier ? { 'shipping.carrier': carrier } : {}),
        ...(trackingNumber ? { 'shipping.trackingNumber': trackingNumber } : {}),
        'shipping.shippedAt': new Date(),
        status: 'shipped',
      },
      { new: true },
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })

    // Push tracking to eBay
    let marketplacePush = { pushed: false }
    try {
      marketplacePush = await marketplaceManager.pushShipping(doc, { carrier, trackingNumber })
    } catch (apiErr) {
      console.warn(`Shipping push to [${doc.marketplace}] failed:`, apiErr.message)
    }

    res.json({ order: doc, marketplacePush })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})


// POST /api/orders/:id/returns — { reason, refundAmount? }
router.post('/:id/returns', async (req, res) => {
  try {
    const doc = await Order.findOne({ _id: req.params.id, ...shopFilter(req, Order) })
    if (!doc) return res.status(404).json({ error: 'Not found' })
    doc.returns.push({
      reason: req.body.reason,
      status: 'requested',
      refundAmount: req.body.refundAmount,
      requestedAt: new Date(),
    })
    await doc.save()
    res.status(201).json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/orders/:id/refund — process full or partial refund on marketplace
router.post('/:id/refund', requireRole('super_admin'), async (req, res) => {
  try {
    const { reason, comment, amount } = req.body
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const refundAmount = amount ? Number(amount) : order.totals?.total || 0

    // Push refund to connected marketplace API
    let marketplaceResult = { success: true }
    try {
      marketplaceResult = await marketplaceManager.processRefund(order, { reason, comment, amount: refundAmount })
    } catch (apiErr) {
      console.warn(`Marketplace refund push failed for [${order.marketplace}]:`, apiErr.message)
    }

    order.status = 'refunded'
    order.returns.push({
      reason: reason || 'Buyer requested refund',
      status: 'received',
      refundAmount,
      refundedAt: new Date(),
      requestedAt: new Date(),
    })
    await order.save()

    res.json({ success: true, order, marketplaceResult })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
