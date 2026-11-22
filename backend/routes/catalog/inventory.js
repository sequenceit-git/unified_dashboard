const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, requireRole, shopFilter, canAccessShop, limitToSection } = require('../../middleware/auth')
const { requireProductAccess } = require('../../services/productAccess')
const { paging, paged, escapeRegex } = require('../../utils/query')
const InventoryLog = require('../../models/InventoryLog')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')
const events = require('../../services/events')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('inventory'), limitToSection('inventory'))


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
    const conditions = []

    if (req.query.marketplace) {
      const marketplace = canonicalMarketplace(req.query.marketplace)
      if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
      const [listingProductIds, shopIds] = await Promise.all([
        Listing.find({ marketplace }).distinct('productId'),
        Listing.find({ marketplace }).distinct('shopId'),
      ])
      conditions.push({
        $or: [
          { shopId: { $in: shopIds } },
          { productId: { $in: listingProductIds } },
        ],
      })
    }

    if (req.query.productId) conditions.push({ productId: req.query.productId })
    if (req.query.shopId) conditions.push({ shopId: req.query.shopId })
    if (req.query.reason && req.query.reason !== 'all') conditions.push({ reason: req.query.reason })
    if (req.query.direction === 'increase') conditions.push({ change: { $gt: 0 } })
    if (req.query.direction === 'decrease') conditions.push({ change: { $lt: 0 } })

    if (req.query.from || req.query.to) {
      const dateCond = {}
      if (req.query.from) dateCond.$gte = new Date(req.query.from)
      if (req.query.to) dateCond.$lte = new Date(req.query.to)
      conditions.push({ createdAt: dateCond })
    }

    if (req.query.q) {
      const q = escapeRegex(req.query.q.trim())
      const productIds = await Product.find({
        $or: [
          { sku: { $regex: q, $options: 'i' } },
          { title: { $regex: q, $options: 'i' } },
        ],
      }).distinct('_id')
      conditions.push({
        $or: [
          { productId: { $in: productIds } },
          { variantSku: { $regex: q, $options: 'i' } },
        ],
      })
    }

    const authShopFilter = shopFilter(req, InventoryLog)
    if (Object.keys(authShopFilter).length > 0) {
      conditions.push(authShopFilter)
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {}
    const pg = paging(req)
    const out = await paged(InventoryLog, filter, pg, { createdAt: -1 })
    out.data = await InventoryLog.populate(out.data, [
      { path: 'productId', select: 'sku title images' },
      { path: 'shopId', select: 'name marketplace' },
      { path: 'createdBy', select: 'name email' },
    ])
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/inventory/adjust — { productId, variantSku?, change?, newStock?, reason, shopId? }
router.post('/adjust', async (req, res) => {
  try {
    const { productId, variantSku, reason, shopId } = req.body
    if (!productId || !reason) {
      return res.status(400).json({ error: 'productId and reason are required' })
    }
    if (!(await requireProductAccess(req, res, productId))) return
    if (shopId && !canAccessShop(req, shopId)) return res.status(403).json({ error: 'You do not have permission for this shop' })
    const product = await Product.findById(productId)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    let change = req.body.change
    let stockBefore
    let stockAfter

    if (variantSku) {
      const v = product.variants.find((x) => x.sku === variantSku)
      if (!v) return res.status(404).json({ error: 'Variant not found' })
      stockBefore = v.stock

      if (req.body.newStock !== undefined && req.body.newStock !== '') {
        const target = Math.max(0, Math.floor(Number(req.body.newStock)))
        change = target - stockBefore
      } else if (change !== undefined && change !== '') {
        change = Math.floor(Number(change))
      } else {
        return res.status(400).json({ error: 'Either newStock or change must be provided' })
      }

      stockAfter = stockBefore + change
      if (stockAfter < 0) return res.status(400).json({ error: 'Insufficient variant stock' })
      if ((Number(product.stock) || 0) + change < 0) return res.status(400).json({ error: 'Insufficient stock' })

      await Product.findOneAndUpdate(
        { _id: productId, 'variants.sku': variantSku },
        { $inc: { 'variants.$.stock': change, stock: change } },
      )
    } else {
      stockBefore = product.stock

      if (req.body.newStock !== undefined && req.body.newStock !== '') {
        const target = Math.max(0, Math.floor(Number(req.body.newStock)))
        change = target - stockBefore
      } else if (change !== undefined && change !== '') {
        change = Math.floor(Number(change))
      } else {
        return res.status(400).json({ error: 'Either newStock or change must be provided' })
      }

      stockAfter = stockBefore + change
      if (stockAfter < 0) return res.status(400).json({ error: 'Insufficient stock' })

      await Product.findByIdAndUpdate(productId, { $inc: { stock: change } })
    }

    let logShopId = shopId || null
    if (!logShopId) {
      const relatedListing = await Listing.findOne({ productId }).sort({ updatedAt: -1 })
      if (relatedListing?.shopId) logShopId = relatedListing.shopId
    }

    const log = await InventoryLog.create({
      productId, variantSku: variantSku || undefined,
      shopId: logShopId, change, stockBefore, stockAfter,
      reason, createdBy: req.user.id,
    })

    const updated = await Product.findById(productId)

    // Synchronize adjusted stock to active/out_of_stock listings and relist ended eBay listings when restocked.
    let pushedCount = 0
    const warnings = []
    try {
      const syncResults = await marketplaceManager.pushProductChanges(updated, { quantity: updated.stock })
      pushedCount = syncResults.filter((r) => r.ok).length
      warnings.push(...syncResults.filter((r) => !r.ok).map((r) => `${r.shopName}: ${r.error}`))
    } catch (err) {
      console.warn('Listing sync failed during stock adjust:', err.message)
      warnings.push(`Listing sync error: ${err.message}`)
    }

    await require('../../services/notify').stockChangedOnShops(updated, { was: stockBefore, stock: updated.stock }).catch(() => {})
    await events.publish({ type: 'sync', kind: 'listings', ok: true }).catch(() => {})

    res.status(201).json({ stockBefore, stockAfter, change, log, pushedToMarketplaces: pushedCount, warnings })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/inventory/sync — push all live product inventory levels to connected marketplace listings
router.post('/sync', async (req, res) => {
  try {
    const listingFilter = { status: { $in: ['live', 'out_of_stock'] }, ...shopFilter(req, Listing) }
    const marketplace = canonicalMarketplace(req.body?.marketplace)
    if (marketplace) listingFilter.marketplace = marketplace
    const listings = await Listing.find(listingFilter).populate('productId').populate('shopId')
    let successCount = 0
    let failCount = 0

    for (const item of listings) {
      if (item.productId && item.shopId) {
        try {
          const pushRes = await marketplaceManager.pushStock(item.shopId, {
            sku: item.productId.sku,
            quantity: item.productId.stock,
            externalListingId: item.externalListingId,
            productId: item.productId._id,
          })
          item.lastSyncedAt = new Date()
          // The shop now holds this number; its next listing sync must read it as "no change".
          item.stock = Math.max(0, Math.floor(Number(item.productId.stock) || 0))
          item.status = (pushRes?.status === 'ended' || pushRes?.ended) ? 'ended' : (item.stock > 0 ? 'live' : 'out_of_stock')
          if (pushRes?.marketplaceStatus) item.marketplaceStatus = pushRes.marketplaceStatus
          item.syncError = null
          await item.save()
          successCount++
        } catch (err) {
          item.syncError = err.message
          await item.save().catch(() => {})
          failCount++
        }
      }
    }

    if (successCount > 0) await events.publish({ type: 'sync', kind: 'listings', ok: true }).catch(() => {})
    res.json({ success: true, synced: successCount, failed: failCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

