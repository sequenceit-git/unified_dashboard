const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, sortOf, paged } = require('../../utils/query')
const Listing = require('../../models/Listing')
const Product = require('../../models/Product')
const Shop = require('../../models/Shop')
const ResearchReport = require('../../models/ResearchReport')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')
const { importProductFromUrl, fillShopAttributes } = require('../../services/productImport')
const { listingUrl } = require('../../utils/listingUrl')

const router = express.Router()

router.use(requireAuth, loadAccess, requireMainRoute('products'))

const SORTABLE = ['createdAt', 'title', 'basePrice', 'costPrice', 'stock']

/** Fields a dashboard edit should send on to live marketplace listings. */
function changedListingFields(before, after) {
  const changes = {}
  if (after.title !== before.title) changes.title = after.title
  if ((after.description || '') !== (before.description || '')) changes.description = after.description
  if (Number(after.basePrice) !== Number(before.basePrice)) changes.price = after.basePrice
  if (Number(after.stock) !== Number(before.stock)) changes.quantity = after.stock
  if (JSON.stringify(after.images || []) !== JSON.stringify(before.images || [])) changes.images = after.images
  return changes
}

// Sub-admins see products through listings of their own shop (schema note 6).
/** `listing` query: any listing status, or inactive (paused or in review). */
function listingStatusFilter(value) {
  switch (value) {
    case 'live':
    case 'out_of_stock':
    case 'pending':
    case 'paused':
    case 'ended':
    case 'error':
      return { status: value }
    case 'inactive': return { status: { $in: ['paused', 'pending'] } }
    default: return {}
  }
}

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
    if (req.query.source) filter.source = req.query.source
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
    let marketplace = null
    if (req.query.marketplace && !req.query.shop) {
      marketplace = canonicalMarketplace(req.query.marketplace)
      if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
      const listingFilter = { marketplace, ...listingStatusFilter(req.query.listing) }
      const rows = await Listing.find(listingFilter).select('productId')
      let productIds = rows.map((row) => row.productId)
      if (ids) {
        const allowed = new Set(ids.map(String))
        productIds = productIds.filter((id) => allowed.has(String(id)))
      }
      const unlisted = !ids && (!req.query.listing || req.query.listing === 'all')
      if (unlisted) {
        filter.$and = [{ $or: [{ _id: { $in: productIds } }, { 'attributes.targetMarketplace': marketplace }] }]
      } else {
        filter._id = { $in: productIds }
      }
    }
    if (req.query.shop) {
      const shopId = req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === req.query.shop)
        ? null
        : req.query.shop
      const rows = shopId ? await Listing.find({ shopId }).select('productId') : []
      filter._id = { $in: rows.map((r) => r.productId) }
    }
    const pg = paging(req)
    const result = await paged(Product, filter, pg, sortOf(req, SORTABLE))
    if (marketplace) {
      const listings = await Listing.find({ marketplace, productId: { $in: result.data.map((row) => row._id) } })
        .select('productId status marketplaceStatus syncError externalListingId listingUrl lastSyncedAt').lean()
      const byProduct = new Map(listings.map((row) => [String(row.productId), {
        ...row,
        listingUrl: listingUrl(marketplace, row.externalListingId, row.listingUrl, { status: row.status }),
      }]))
      result.data = result.data.map((row) => {
        const plain = typeof row.toObject === 'function' ? row.toObject() : row
        return { ...plain, shopListing: byProduct.get(String(plain._id)) || null }
      })
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/products/import-url — { url } → editable draft read from a product page
router.post('/import-url', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await importProductFromUrl(req.body.url, {
      useAi: req.body.useAi !== false,
      marketplace: canonicalMarketplace(req.body.marketplace),
    }))
  } catch (err) {
    res.status(422).json({ error: err.message })
  }
})

// POST /api/products/fill-attributes — map known facts onto a shop category schema
router.post('/fill-attributes', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await fillShopAttributes({
      title: req.body.title,
      description: req.body.description,
      brand: req.body.brand,
      attributes: req.body.attributes,
      schema: req.body.schema,
    }))
  } catch (err) {
    res.status(422).json({ error: err.message })
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

// PATCH /api/products/:id
router.patch('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const before = await Product.findById(req.params.id).lean()
    if (!before) return res.status(404).json({ error: 'Not found' })
    // The SKU links the product to its marketplace listings, so it never changes.
    const { sku, ...update } = req.body
    const doc = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    const changes = changedListingFields(before, doc)
    const marketplaceSync = Object.keys(changes).length ? await marketplaceManager.pushProductChanges(doc, changes) : []
    if (changes.quantity != null) {
      const listing = await Listing.findOne({ productId: doc._id }).populate('shopId', 'name marketplace')
      await require('../../services/notify').stockChanged(doc, listing?.shopId, { was: before.stock }).catch(() => {})
    }
    res.json({ ...doc.toObject(), marketplaceSync })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/products/:id — remove the product and its shop listings
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const doc = await Product.findByIdAndDelete(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    await Listing.deleteMany({ productId: doc._id })
    res.json({ deleted: true })
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

    const stock = req.body.stock !== undefined && req.body.stock !== '' ? Number(req.body.stock) : product.stock
    const listingOptions = {
      price,
      stock,
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

    const capabilities = marketplaceManager.listingCapabilities(shop.marketplace)
    if (!capabilities.canList) return res.status(422).json({ error: capabilities.note || `Listing on ${shop.name} is not available.` })

    const existing = await Listing.findOne({ productId: product._id, shopId: shop._id })
    if (existing?.externalListingId && ['live', 'pending', 'out_of_stock'].includes(existing.status)) {
      return res.status(409).json({ error: `Already listed on ${shop.name}. Edit the product to update the listing.` })
    }

    let publishRes
    try {
      publishRes = await marketplaceManager.publishListing(shop, product, listingOptions)
    } catch (apiErr) {
      console.warn(`Marketplace [${shop.marketplace}] listing error:`, apiErr.message)
      const failed = await Listing.findOneAndUpdate(
        { productId: product._id, shopId: shop._id },
        { productId: product._id, shopId: shop._id, marketplace: shop.marketplace, price, status: 'error', syncError: apiErr.message, lastSyncedAt: new Date() },
        { new: true, upsert: true, runValidators: true },
      )
      await require('../../services/notify').listingStatusChanged(failed, shop, {}).catch(() => {})
      return res.status(422).json({ error: apiErr.message, missingSpecifics: apiErr.missingSpecifics || [] })
    }

    if (stock !== product.stock || product.status === 'draft') {
      await Product.updateOne({ _id: product._id }, { stock, status: 'active' })
    }
    const listing = await Listing.findOneAndUpdate(
      { productId: product._id, shopId: shop._id },
      {
        productId: product._id,
        shopId: shop._id,
        marketplace: shop.marketplace,
        externalListingId: publishRes.externalListingId,
        listingUrl: listingUrl(shop.marketplace, publishRes.externalListingId, null, { status: publishRes.status || 'pending' }),
        price,
        status: publishRes.status || 'pending',
        ...(publishRes.marketplaceStatus ? { marketplaceStatus: publishRes.marketplaceStatus } : {}),
        syncError: null,
        lastSyncedAt: new Date(),
      },
      { new: true, upsert: true, runValidators: true },
    )
    if (product.sourceReportId) {
      await ResearchReport.updateOne(
        { _id: product.sourceReportId, 'opportunities.addedProductId': product._id },
        { $addToSet: { 'opportunities.$.listedShops': shop.marketplace } },
      )
    }
    await require('../../services/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    res.status(201).json(listing)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/products/:id/listing-action — { action: end|relist|unpublish|publish|delete }
router.post('/:id/listing-action', requireRole('super_admin'), async (req, res) => {
  try {
    const action = String(req.body.action || '')
    const listing = await Listing.findOne({ productId: req.params.id, ...(req.body.marketplace ? { marketplace: req.body.marketplace } : {}) })
    if (!listing?.externalListingId) return res.status(404).json({ error: 'This product is not listed on a shop yet.' })
    const shop = await Shop.findById(listing.shopId)
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    const result = await marketplaceManager.applyListingAction(shop, listing, action)
    listing.status = result.status || listing.status
    if (result.marketplaceStatus) listing.marketplaceStatus = result.marketplaceStatus
    if (result.externalListingId) listing.externalListingId = result.externalListingId
    listing.listingUrl = listingUrl(shop.marketplace, listing.externalListingId, listing.listingUrl, { status: listing.status })
    listing.syncError = null
    listing.lastSyncedAt = new Date()
    await listing.save()
    await require('../../services/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    res.json({
      ...listing.toObject(),
      listingUrl: listing.listingUrl,
    })
  } catch (err) {
    res.status(422).json({ error: err.message })
  }
})

// PATCH /api/products/:id/sync — push local price/stock to its listings
router.patch('/:id/sync', requireRole('super_admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const results = await marketplaceManager.pushProductChanges(product, { price: product.basePrice, quantity: product.stock })
    res.json({
      listingsUpdated: results.length,
      pushedToMarketplaces: results.filter((item) => item.ok).length,
      marketplaceSync: results,
    })
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

    const results = await marketplaceManager.pushProductChanges(product, { price: numPrice })
    res.json({ product, pushedToMarketplaces: results.filter((item) => item.ok).length, marketplaceSync: results })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

