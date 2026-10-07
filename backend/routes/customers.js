const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { paging, sortOf, paged } = require('../utils/query')
const Conversation = require('../models/Conversation')
const Customer = require('../models/Customer')
const Order = require('../models/Order')

const router = express.Router()
router.use(requireAuth)

function scope(req) {
  if (req.user.role !== 'sub_admin') return {}
  return { 'identities.shopId': req.user.shopId }
}

// GET /api/customers?q=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const filter = { ...scope(req) }
    if (req.query.q) {
      const q = req.query.q.trim()
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ]
    }
    const pg = paging(req)
    res.json(await paged(Customer, filter, pg, sortOf(req, ['lastOrderAt', 'totalSpent', 'orderCount', 'createdAt'], '-lastOrderAt')))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/customers/:id — profile + order history + conversations
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ...scope(req) })
    if (!customer) return res.status(404).json({ error: 'Not found' })
    const [orders, conversations] = await Promise.all([
      Order.find({ customerId: customer._id }).sort({ placedAt: -1 }).limit(50),
      Conversation.find({ customerId: customer._id }).sort({ lastMessageAt: -1 }).limit(20),
    ])
    res.json({ ...customer.toObject(), orders, conversations })
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
