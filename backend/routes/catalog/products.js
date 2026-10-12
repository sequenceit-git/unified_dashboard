const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Listing = require('../../models/Listing')
const Product = require('../../models/Product')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')

const router = express.Router()

router.use(requireAuth, loadAccess, requireMainRoute('products'))

const SORTABLE = ['createdAt', 'title', 'basePrice', 'stock']

// Sub-admins see products through listings of their own shop (schema note 6).
async function scopedIds(req) {
  if (req.user.role !== 'sub_admin') return null
  const rows = await Listing.find({ shopId: { $in: req.allowedShopIds } }).select('productId')
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
      const shopId = req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === req.query.shop)
        ? null
        : req.query.shop
      const rows = shopId ? await Listing.find({ shopId }).select('productId') : []
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
    const listingFilter = { productId: req.params.id, ...shopFilter(req, Listing) }
    const listings = await Listing.find(listingFilter).populate('shopId', 'name marketplace')
    if (req.user.role === 'sub_admin' && listings.length === 0) {
      return res.status(404).json({ error: 'Not found' })
    }
    const doc = await Product.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
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
    const normalized = req.body.products.map((p) => {
      let images = p.images
      if (typeof images === 'string') {
        images = images.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
      } else if (!Array.isArray(images)) {
        images = []
      }
      return {
        ...p,
        images,
        weight: p.weight !== undefined && p.weight !== '' ? Number(p.weight) : 1,
        dimensions: {
          length: p.dimensions?.length ? Number(p.dimensions.length) : (p.length ? Number(p.length) : 10),
          width: p.dimensions?.width ? Number(p.dimensions.width) : (p.width ? Number(p.width) : 10),
          height: p.dimensions?.height ? Number(p.dimensions.height) : (p.height ? Number(p.height) : 5),
          unit: p.dimensions?.unit || 'in',
        },
      }
    })
    const docs = await Product.insertMany(normalized, { ordered: false })
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

// POST /api/products/:id/list — list a product on a shop { shopId, price?, title?, categoryId?, condition?, weight?, dimensions?, images?, aspects? }
router.post('/:id/list', requireRole('super_admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const shop = await Shop.findById(req.body.shopId).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })

    const price = req.body.price !== undefined && req.body.price !== '' ? Number(req.body.price) : product.basePrice

    // Prepare marketplace-tailored listing options
    let images = req.body.images
    if (typeof images === 'string') {
      images = images.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    } else if (!Array.isArray(images) || images.length === 0) {
      images = product.images || []
    }

    const listingOptions = {
      price,
      title: req.body.title || product.title,
      description: req.body.description || product.description,
      categoryId: req.body.categoryId,
      condition: req.body.condition || 'NEW',
      weight: req.body.weight !== undefined && req.body.weight !== '' ? Number(req.body.weight) : (product.weight || 1),
      dimensions: req.body.dimensions || product.dimensions,
      images,
      aspects: req.body.aspects,
      brand: req.body.brand || product.brand,
    }

    // Push listing to eBay
    let externalListingId = null
    let listingStatus = 'pending'
    let syncError = null

    try {
      const publishRes = await marketplaceManager.publishListing(shop, product, listingOptions)
      if (publishRes?.externalListingId) externalListingId = publishRes.externalListingId
      if (publishRes?.status) listingStatus = publishRes.status
    } catch (apiErr) {
      console.warn(`Marketplace [${shop.marketplace}] listing error:`, apiErr.message)
      listingStatus = 'error'
      syncError = apiErr.message
    }

    const listing = await Listing.findOneAndUpdate(
      { productId: product._id, shopId: shop._id },
      {
        productId: product._id,
        shopId: shop._id,
        marketplace: shop.marketplace,
        ...(externalListingId ? { externalListingId } : {}),
        price,
        status: listingStatus,
        syncError,
        lastSyncedAt: new Date(),
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

    const listings = await Listing.find({ productId: product._id, ...shopFilter(req, Listing) }).populate('shopId')
    let pushedCount = 0

    for (const item of listings) {
      if (item.shopId) {
        try {
          await marketplaceManager.pushStock(item.shopId, {
            sku: product.sku,
            quantity: product.stock,
            externalListingId: item.externalListingId,
            productId: product._id,
          })
          pushedCount++
        } catch (apiErr) {
          console.warn(`Stock sync failed for shop ${item.shopId.name}:`, apiErr.message)
        }
      }
    }

    const r = await Listing.updateMany(
      { productId: product._id, ...shopFilter(req, Listing) },
      { price: product.basePrice, lastSyncedAt: new Date() },
    )
    res.json({ listingsUpdated: r.modifiedCount ?? 0, pushedToMarketplaces: pushedCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/products/:id/price — update price and push to connected shops
router.patch('/:id/price', requireRole('super_admin'), async (req, res) => {
  try {
    const { price } = req.body
    if (price === undefined || price === null || isNaN(Number(price))) {
      return res.status(400).json({ error: 'Valid price is required' })
    }

    const numPrice = Number(price)
    const product = await Product.findByIdAndUpdate(req.params.id, { basePrice: numPrice }, { new: true })
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const listings = await Listing.find({ productId: product._id, ...shopFilter(req, Listing) }).populate('shopId')
    let pushedCount = 0

    for (const item of listings) {
      if (item.shopId) {
        try {
          await marketplaceManager.pushPrice(item.shopId, {
            sku: product.sku,
            price: numPrice,
            externalListingId: item.externalListingId,
          })
          item.price = numPrice
          item.lastSyncedAt = new Date()
          await item.save()
          pushedCount++
        } catch (apiErr) {
          console.warn(`Price push failed for shop ${item.shopId.name}:`, apiErr.message)
        }
      }
    }

    res.json({ product, pushedToMarketplaces: pushedCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

