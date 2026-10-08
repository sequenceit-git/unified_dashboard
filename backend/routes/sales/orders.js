const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Order = require('../../models/Order')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('orders'))

const SORTABLE = ['placedAt', 'totals.total', 'createdAt', 'status']

// GET /api/orders?marketplace=&shopId=&status=&q=&from=&to=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const filter = { ...shopFilter(req, Order) }
    if (req.query.marketplace && req.query.marketplace !== 'all') {
      filter.marketplace = req.query.marketplace
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
      },
      { new: true },
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
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

// PATCH /api/orders/:id/returns/:index — { status }
router.patch('/:id/returns/:index', requireRole('super_admin'), async (req, res) => {
  try {
    const doc = await Order.findById(req.params.id)
    if (!doc || !doc.returns[req.params.index]) {
      return res.status(404).json({ error: 'Return not found' })
    }
    const ret = doc.returns[req.params.index]
    ret.status = req.body.status
    if (req.body.status === 'received' && ret.refundAmount) ret.refundedAt = new Date()
    await doc.save()
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
