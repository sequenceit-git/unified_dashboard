const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter, limitToSection } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Order = require('../../models/Order')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const { canonical: canonicalMarketplace } = require('../../marketplaces')
const syncQueue = require('../../services/syncQueue')
const cache = require('../../services/cache')
const events = require('../../services/events')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('orders'), limitToSection('orders'))

async function notifyOrderChanged(order) {
  if (!order) return
  await Promise.all([
    cache.invalidate(`shop:${order.shopId}:`),
    cache.invalidate('resp:dashboard:'),
    cache.invalidate('resp:analytics:'),
  ]).catch(() => {})
  await events.publish({
    type: 'sync',
    kind: 'orders',
    shopId: String(order.shopId),
    marketplace: order.marketplace,
    ok: true,
  }).catch(() => {})
}


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
    const q = req.query.q?.trim().toLowerCase()
    if (q) {
      const candidates = await Order.find(filter)
        .sort(sortOf(req, SORTABLE, '-placedAt'))
      const filtered = candidates.filter((row) => [
        row.externalOrderId,
        row.shipping?.trackingNumber,
        row.buyer?.name,
        row.buyer?.username,
        row.buyer?.email,
        ...(row.items || []).flatMap((item) => [item.sku, item.title]),
      ].some((value) => String(value || '').toLowerCase().includes(q)))
      const pg = paging(req)
      const total = filtered.length
      return res.json({
        data: filtered.slice(pg.skip, pg.skip + pg.limit),
        page: pg.page,
        limit: pg.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pg.limit)),
      })
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
      .populate('customerId', 'name email phone identities address')
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
    const filter = { status: 'connected' }
    if (req.user.role === 'sub_admin') {
      filter._id = { $in: req.allowedShopIds || [] }
    }
    if (req.body.shopId) {
      if (req.user.role === 'sub_admin' && !req.allowedShopIds?.some((id) => String(id) === String(req.body.shopId))) {
        return res.status(403).json({ error: 'You do not have access to this shop' })
      }
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
    const existing = await Order.findOne({ _id: req.params.id, ...shopFilter(req, Order) })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    if (req.body.status === 'cancelled' && existing.status !== 'cancelled') {
      if (['shipped', 'delivered'].includes(existing.status)) {
        return res.status(400).json({ error: 'Cannot cancel an order that has already shipped or delivered' })
      }
      try {
        await marketplaceManager.cancelOrder(existing, { reason: 'BUYER_ASKED_CANCEL', comment: 'Cancelled from dashboard' })
      } catch (apiErr) {
        console.warn(`Marketplace order cancellation push failed for [${existing.marketplace}]:`, apiErr.message)
        return res.status(502).json({ error: `${existing.marketplace} could not cancel this order: ${apiErr.message}` })
      }
    }

    const doc = await Order.findOneAndUpdate(
      { _id: req.params.id, ...shopFilter(req, Order) },
      { status: req.body.status },
      { new: true, runValidators: true },
    )
    await notifyOrderChanged(doc)
    if (req.body.status === 'cancelled' && existing.status !== 'cancelled') {
      syncQueue.enqueue('listings', existing.shopId, { push: true }).catch(() => {})
    }
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/orders/:id/shipping — { carrier, trackingNumber }
router.patch('/:id/shipping', async (req, res) => {
  try {
    const { carrier, trackingNumber } = req.body
    const existing = await Order.findOne({ _id: req.params.id, ...shopFilter(req, Order) })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    // Push tracking to marketplace before marking shipped locally so a rejected push does not lock the order.
    let marketplacePush = { pushed: false }
    try {
      marketplacePush = await marketplaceManager.pushShipping(existing, { carrier, trackingNumber })
    } catch (apiErr) {
      console.warn(`Shipping push to [${existing.marketplace}] failed:`, apiErr.message)
      return res.status(502).json({
        error: `${existing.marketplace} did not accept the tracking: ${apiErr.message}`,
        marketplacePush: { pushed: false, error: apiErr.message },
      })
    }

    existing.shipping = existing.shipping || {}
    if (carrier) existing.shipping.carrier = carrier
    if (trackingNumber) existing.shipping.trackingNumber = trackingNumber
    existing.shipping.shippedAt = new Date()
    if (marketplacePush?.pushed) existing.shipping.trackingVerified = true
    existing.status = 'shipped'
    await existing.save()

    await notifyOrderChanged(existing)
    res.json({ order: existing, marketplacePush })
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

// PATCH /api/orders/:id/returns/:index — { status: 'approved' | 'rejected' | 'received' }
router.patch('/:id/returns/:index', async (req, res) => {
  try {
    const { status } = req.body
    const order = await Order.findOne({ _id: req.params.id, ...shopFilter(req, Order) })
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const idx = parseInt(req.params.index, 10)
    if (isNaN(idx) || !order.returns?.[idx]) {
      return res.status(404).json({ error: 'Return record not found' })
    }

    order.returns[idx].status = status || order.returns[idx].status
    if (['approved', 'rejected', 'received'].includes(status)) {
      order.returns[idx].refundedAt = new Date()
    }
    await order.save()
    res.json(order)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/orders/:id/cancel — cancel order on connected marketplace and mark locally cancelled
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason = 'OUT_OF_STOCK', comment = '' } = req.body
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(order.shopId))) {
      return res.status(403).json({ error: 'You do not have permission to manage orders for this shop' })
    }

    if (['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel an order that has already shipped or delivered' })
    }

    let marketplaceResult = { success: true }
    try {
      marketplaceResult = await marketplaceManager.cancelOrder(order, { reason, comment })
    } catch (apiErr) {
      // Don't mark the order cancelled here while it is still live on the marketplace.
      console.warn(`Marketplace order cancellation push failed for [${order.marketplace}]:`, apiErr.message)
      return res.status(502).json({ error: `${order.marketplace} could not cancel this order: ${apiErr.message}` })
    }

    order.status = 'cancelled'
    await order.save()
    await notifyOrderChanged(order)
    syncQueue.enqueue('listings', order.shopId, { push: true }).catch(() => {})

    res.json({ success: true, order, marketplaceResult })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/orders/:id/refund — process full or partial refund on marketplace
router.post('/:id/refund', async (req, res) => {
  try {
    const { reason, comment, amount } = req.body
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(order.shopId))) {
      return res.status(403).json({ error: 'You do not have permission to manage orders for this shop' })
    }

    const refundAmount = amount ? Number(amount) : order.totals?.total || 0
    const prevRefunded = (order.returns || []).reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0)

    // Push refund to connected marketplace API
    let marketplaceResult = { success: true }
    try {
      marketplaceResult = await marketplaceManager.processRefund(order, { reason, comment, amount: refundAmount })
    } catch (apiErr) {
      console.warn(`Marketplace refund push failed for [${order.marketplace}]:`, apiErr.message)
      return res.status(502).json({ error: `${order.marketplace} could not refund this order: ${apiErr.message}` })
    }

    if (!order.totals?.total || prevRefunded + refundAmount >= order.totals.total) {
      order.status = 'refunded'
    }
    order.returns.push({
      reason: reason || 'Buyer requested refund',
      status: 'received',
      refundAmount,
      refundedAt: new Date(),
      requestedAt: new Date(),
    })
    await order.save()
    await notifyOrderChanged(order)

    res.json({ success: true, order, marketplaceResult })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
