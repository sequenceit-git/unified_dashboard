const express = require('express')
const { requireAuth } = require('../middleware/auth')
const Shop = require('../models/Shop')

const router = express.Router()
router.use(requireAuth)

// GET /api/shops — id/name/marketplace for dropdowns and tabs.
// Sub-admins only see their own shop.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'sub_admin' ? { _id: req.user.shopId } : {}
    const shops = await Shop.find(filter).select('name marketplace status').sort({ marketplace: 1 })
    res.json(shops)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
