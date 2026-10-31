const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter } = require('../../middleware/auth')
const { paging, paged } = require('../../utils/query')
const InventoryLog = require('../../models/InventoryLog')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('inventory'))


// GET /api/inventory/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    const listingFilter = {}
    if (req.user.role === 'sub_admin') listingFilter.shopId = { $in: req.allowedShopIds }
    const marketplace = canonicalMarketplace(req.query.marketplace)
    if (marketplace) listingFilter.marketplace = marketplace
    const filter = { $expr: { $lte: ['$stock', '$lowStockThreshold'] } }
    if (Object.keys(listingFilter).length) {
      filter._id = { $in: await Listing.find(listingFilter).distinct('productId') }
    }
    const docs = await Product.find(filter)
      .sort({ stock: 1 })
      .limit(100)
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/inventory/logs?productId=&shopId=&reason=&direction=&q=&from=&to=&page=&limit=
router.get('/logs', async (req, res) => {
  try {
    const filter = {}
    if (req.query.marketplace) {
      const marketplace = canonicalMarketplace(req.query.marketplace)
      if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
      filter.shopId = { $in: await Listing.find({ marketplace }).distinct('shopId') }
    }
    if (req.query.productId) filter.productId = req.query.productId
    if (req.query.shopId) filter.shopId = req.query.shopId
    if (req.query.reason) filter.reason = req.query.reason
    if (req.query.direction === 'increase') filter.change = { $gt: 0 }
    if (req.query.direction === 'decrease') filter.change = { $lt: 0 }
    if (req.query.from || req.query.to) {
      filter.createdAt = {}
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from)
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to)
    }
    if (req.query.q) {
      const q = req.query.q.trim()
      const productIds = await Product.find({
        $or: [
          { sku: { $regex: q, $options: 'i' } },
          { title: { $regex: q, $options: 'i' } },
        ],
      }).distinct('_id')
      filter.$or = [
        { productId: { $in: productIds } },
        { variantSku: { $regex: q, $options: 'i' } },
      ]
    }
    Object.assign(filter, shopFilter(req, InventoryLog))
    const pg = paging(req)
    const out = await paged(InventoryLog, filter, pg, { createdAt: -1 })
    out.data = await InventoryLog.populate(out.data, [
      { path: 'productId', select: 'sku title' },
      { path: 'shopId', select: 'name marketplace' },
      { path: 'createdBy', select: 'name email' },
    ])
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/inventory/adjust — { productId, variantSku?, change, reason, shopId? }
router.post('/adjust', requireRole('super_admin'), async (req, res) => {
  try {
    const { productId, variantSku, change, reason, shopId } = req.body
    if (!productId || !Number.isInteger(change) || !reason) {
      return res.status(400).json({ error: 'productId, integer change, reason required' })
    }
    const product = await Product.findById(productId)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    let stockBefore
    let stockAfter
    if (variantSku) {
      const v = product.variants.find((x) => x.sku === variantSku)
      if (!v) return res.status(404).json({ error: 'Variant not found' })
      stockBefore = v.stock
      stockAfter = v.stock + change
      if (stockAfter < 0) return res.status(400).json({ error: 'Insufficient variant stock' })
      await Product.findOneAndUpdate(
        { _id: productId, 'variants.sku': variantSku },
        { $inc: { 'variants.$.stock': change } },
      )
    } else {
      stockBefore = product.stock
      stockAfter = product.stock + change
      if (stockAfter < 0) return res.status(400).json({ error: 'Insufficient stock' })
      await Product.findByIdAndUpdate(productId, { $inc: { stock: change } })
    }

    const log = await InventoryLog.create({
      productId, variantSku: variantSku || undefined,
      shopId: shopId || null, change, stockBefore, stockAfter,
      reason, createdBy: req.user.id,
    })

    // Synchronize adjusted stock to active marketplace listings
    let pushedCount = 0
    try {
      const listings = await Listing.find({ productId, status: { $in: ['live', 'out_of_stock'] } }).populate('shopId')
      for (const item of listings) {
        if (item.shopId) {
          try {
            await marketplaceManager.pushStock(item.shopId, {
              sku: variantSku || product.sku,
              quantity: stockAfter,
              externalListingId: item.externalListingId,
              productId,
            })
            pushedCount++
          } catch (apiErr) {
            console.warn(`Stock push failed for shop ${item.shopId.name}:`, apiErr.message)
          }
        }
      }
    } catch (err) {
      console.warn('Listing query failed during stock adjust:', err.message)
    }

    res.status(201).json({ stockBefore, stockAfter, log, pushedToMarketplaces: pushedCount })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/inventory/sync — push all live product inventory levels to connected marketplace listings
router.post('/sync', requireRole('super_admin'), async (req, res) => {
  try {
    const listingFilter = { status: { $in: ['live', 'out_of_stock'] } }
    const marketplace = canonicalMarketplace(req.body?.marketplace)
    if (marketplace) listingFilter.marketplace = marketplace
    const listings = await Listing.find(listingFilter).populate('productId').populate('shopId')
    let successCount = 0
    let failCount = 0

    for (const item of listings) {
      if (item.productId && item.shopId) {
        try {
          await marketplaceManager.pushStock(item.shopId, {
            sku: item.productId.sku,
            quantity: item.productId.stock,
            externalListingId: item.externalListingId,
            productId: item.productId._id,
          })
          item.lastSyncedAt = new Date()
          await item.save()
          successCount++
        } catch {
          failCount++
        }
      }
    }

    res.json({ success: true, synced: successCount, failed: failCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

