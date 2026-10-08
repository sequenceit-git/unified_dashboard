const express = require('express')
const { requireAuth, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Listing = require('../../models/Listing')
const Product = require('../../models/Product')

const router = express.Router()
router.use(requireAuth)

const SORTABLE = ['createdAt', 'title', 'basePrice', 'stock']

// Sub-admins see products through listings of their own shop (schema note 6).
async function scopedIds(req) {
  if (req.user.role !== 'sub_admin') return null
  const rows = await Listing.find({ shopId: req.user.shopId }).select('productId')
  return rows.map((r) => r.productId)
}

// GET /api/products?q=&status=&category=&stock=low|out&shop=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.category) filter.category = req.query.category
    if (req.query.q) {
      const q = req.query.q.trim()
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
      ]
    }
    if (req.query.stock === 'low') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] }
    if (req.query.stock === 'out') filter.stock = 0
    const ids = await scopedIds(req)
    if (ids) filter._id = { $in: ids }
    if (req.query.shop) {
      const rows = await Listing.find({ shopId: req.query.shop }).select('productId')
      filter._id = { $in: rows.map((r) => r.productId) }
    }
    const pg = paging(req)
    res.json(await paged(Product, filter, pg, sortOf(req, SORTABLE)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/products/categories
router.get('/categories', async (req, res) => {
  try {
    res.json(await Product.distinct('category'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Product.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    const listings = await Listing.find({ productId: doc._id }).populate('shopId', 'name marketplace')
    res.json({ ...doc.toObject(), listings })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/products
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    res.status(201).json(await Product.create(req.body))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/products/bulk — { products: [...] } for bulk upload
router.post('/bulk', requireRole('super_admin'), async (req, res) => {
  try {
    if (!Array.isArray(req.body.products)) {
      return res.status(400).json({ error: 'products must be an array' })
    }
    const docs = await Product.insertMany(req.body.products, { ordered: false })
    res.status(201).json({ created: docs.length })
  } catch (err) {
    res.status(400).json({ error: err.message, inserted: err.insertedDocs?.length || 0 })
  }
})

// PATCH /api/products/:id
router.patch('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const doc = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/products/:id — archive by default, ?hard=true to remove
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    if (req.query.hard === 'true') {
      await Product.findByIdAndDelete(req.params.id)
      return res.json({ deleted: true })
    }
    const doc = await Product.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true })
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/products/:id/list — list a product on a shop { shopId, price? }
router.post('/:id/list', requireRole('super_admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })
    // BLOCKER (no marketplace API yet): this only stages a local listing row
    // with status `pending`. A real push to eBay/Temu/TikTok happens in 2.1.
    const listing = await Listing.findOneAndUpdate(
      { productId: product._id, shopId: req.body.shopId },
      {
        productId: product._id,
        shopId: req.body.shopId,
        price: req.body.price ?? product.basePrice,
        status: 'pending',
      },
      { new: true, upsert: true, runValidators: true },
    )
    res.status(201).json(listing)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/products/:id/sync — push local price/stock to its listings
router.patch('/:id/sync', requireRole('super_admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })
    // BLOCKER: local-only sync. Marketplace-side update needs 2.1 integration.
    const r = await Listing.updateMany(
      { productId: product._id, ...shopFilter(req, Listing) },
      { price: product.basePrice, lastSyncedAt: new Date() },
    )
    res.json({ listingsUpdated: r.modifiedCount ?? 0 })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
