const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, shopFilter } = require('../../middleware/auth')
const { paging, sortOf } = require('../../utils/query')
const Conversation = require('../../models/Conversation')
const Customer = require('../../models/Customer')
const Order = require('../../models/Order')
const { canonicalMarketplace } = require('../../utils/marketplace')
const { orderMatch, withOrderStats } = require('../../services/customerStats')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('customers'))

function scope(req) {
  if (req.user.role !== 'sub_admin') return {}
  return { 'identities.shopId': { $in: req.allowedShopIds } }
}

// GET /api/customers?q=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const filter = { ...scope(req) }
    const marketplace = canonicalMarketplace(req.query.marketplace)
    if (marketplace) filter['identities.marketplace'] = marketplace
    if (req.query.q) {
      const q = req.query.q.trim()
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ]
    }
    const pg = paging(req)
    const sort = sortOf(req, ['lastOrderAt', 'totalSpent', 'orderCount', 'createdAt'], '-lastOrderAt')
    const sortKey = Object.keys(sort)[0]
    const direction = sort[sortKey]
    const customers = await withOrderStats(await Customer.find(filter), marketplace)
    const sortValue = (row) => {
      const raw = row[sortKey]
      if (raw == null || raw === '') return null
      return sortKey === 'lastOrderAt' ? new Date(raw).getTime() : raw
    }
    customers.sort((a, b) => {
      const left = sortValue(a)
      const right = sortValue(b)
      if (left == null && right == null) return 0
      if (left == null) return 1
      if (right == null) return -1
      if (left > right) return direction
      if (left < right) return -direction
      return 0
    })
    const total = customers.length
    res.json({
      data: customers.slice(pg.skip, pg.skip + pg.limit),
      page: pg.page,
      limit: pg.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pg.limit)),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/customers/:id — profile + order history + conversations
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ...scope(req) })
    if (!customer) return res.status(404).json({ error: 'Not found' })
    const marketplace = canonicalMarketplace(req.query.marketplace)
    const orderFilter = orderMatch([customer], marketplace)
    const access = shopFilter(req, Order)
    if (Object.keys(access).length) orderFilter.$and.push(access)
    const [orders, conversations, [stats]] = await Promise.all([
      Order.find(orderFilter).sort({ placedAt: -1 }).limit(50),
      Conversation.find({ customerId: customer._id, ...shopFilter(req, Conversation) }).sort({ lastMessageAt: -1 }).limit(20),
      withOrderStats([customer], marketplace),
    ])
    res.json({ ...stats, orders, conversations })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/customers/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, email, phone } = req.body
    const doc = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...scope(req) },
      { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { phone } : {}) },
      { new: true, runValidators: true },
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
