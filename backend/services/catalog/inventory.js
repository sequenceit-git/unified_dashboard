/** Generated from routes/catalog/inventory.js: business logic behind the routes; routes only handle HTTP. */
const { paging, paged, escapeRegex } = require('../../utils/query')
const InventoryLog = require('../../models/InventoryLog')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const marketplaceManager = require('../../services/marketplace')
const { canonical: canonicalMarketplace } = require('../../marketplaces')
const events = require('../../services/core/events')
const { HttpError } = require('../../utils/httpError')
const { shopFilter, canAccessShop } = require('../../middleware/auth')
const { assertProductAccess } = require('../productAccess')

/** GET /low-stock */
async function lowStock(ctx) {
    const listingFilter = {}
    if (ctx.user.role === 'sub_admin') listingFilter.shopId = { $in: ctx.allowedShopIds }
    const marketplace = canonicalMarketplace(ctx.query.marketplace)
    if (marketplace) listingFilter.marketplace = marketplace
    const filter = { $expr: { $lte: ['$stock', '$lowStockThreshold'] } }
    if (Object.keys(listingFilter).length) {
      filter._id = { $in: await Listing.find(listingFilter).distinct('productId') }
    }
    const docs = await Product.find(filter)
      .sort({ stock: 1 })
      .limit(100)
    return docs
}

/** GET /logs */
async function logs(ctx) {
    const conditions = []

    if (ctx.query.marketplace) {
      const marketplace = canonicalMarketplace(ctx.query.marketplace)
      if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
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

    if (ctx.query.productId) conditions.push({ productId: ctx.query.productId })
    if (ctx.query.shopId) conditions.push({ shopId: ctx.query.shopId })
    if (ctx.query.reason && ctx.query.reason !== 'all') conditions.push({ reason: ctx.query.reason })
    if (ctx.query.direction === 'increase') conditions.push({ change: { $gt: 0 } })
    if (ctx.query.direction === 'decrease') conditions.push({ change: { $lt: 0 } })

    if (ctx.query.from || ctx.query.to) {
      const dateCond = {}
      if (ctx.query.from) dateCond.$gte = new Date(ctx.query.from)
      if (ctx.query.to) dateCond.$lte = new Date(ctx.query.to)
      conditions.push({ createdAt: dateCond })
    }

    if (ctx.query.q) {
      const q = escapeRegex(ctx.query.q.trim())
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

    const authShopFilter = shopFilter(ctx, InventoryLog)
    if (Object.keys(authShopFilter).length > 0) {
      conditions.push(authShopFilter)
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {}
    const pg = paging(ctx)
    const out = await paged(InventoryLog, filter, pg, { createdAt: -1 })
    out.data = await InventoryLog.populate(out.data, [
      { path: 'productId', select: 'sku title images' },
      { path: 'shopId', select: 'name marketplace' },
      { path: 'createdBy', select: 'name email' },
    ])
    return out
}

/** POST /adjust */
async function adjust(ctx) {
    const { productId, variantSku, reason, shopId } = ctx.body
    if (!productId || !reason) {
      throw new HttpError(400, { error: 'productId and reason are required' })
    }
    await assertProductAccess(ctx, productId)
    if (shopId && !canAccessShop(ctx, shopId)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const product = await Product.findById(productId)
    if (!product) throw new HttpError(404, { error: 'Product not found' })

    let change = ctx.body.change
    let stockBefore
    let stockAfter

    if (variantSku) {
      const v = product.variants.find((x) => x.sku === variantSku)
      if (!v) throw new HttpError(404, { error: 'Variant not found' })
      stockBefore = v.stock

      if (ctx.body.newStock !== undefined && ctx.body.newStock !== '') {
        const target = Math.max(0, Math.floor(Number(ctx.body.newStock)))
        change = target - stockBefore
      } else if (change !== undefined && change !== '') {
        change = Math.floor(Number(change))
      } else {
        throw new HttpError(400, { error: 'Either newStock or change must be provided' })
      }

      stockAfter = stockBefore + change
      if (stockAfter < 0) throw new HttpError(400, { error: 'Insufficient variant stock' })
      if ((Number(product.stock) || 0) + change < 0) throw new HttpError(400, { error: 'Insufficient stock' })

      await Product.findOneAndUpdate(
        { _id: productId, 'variants.sku': variantSku },
        { $inc: { 'variants.$.stock': change, stock: change } },
      )
    } else {
      stockBefore = product.stock

      if (ctx.body.newStock !== undefined && ctx.body.newStock !== '') {
        const target = Math.max(0, Math.floor(Number(ctx.body.newStock)))
        change = target - stockBefore
      } else if (change !== undefined && change !== '') {
        change = Math.floor(Number(change))
      } else {
        throw new HttpError(400, { error: 'Either newStock or change must be provided' })
      }

      stockAfter = stockBefore + change
      if (stockAfter < 0) throw new HttpError(400, { error: 'Insufficient stock' })

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
      reason, createdBy: ctx.user.id,
    })

    const updated = await Product.findById(productId)

    // Synchronize adjusted stock to active/out_of_stock listings and relist ended eBay listings when restocked.
    let pushedCount = 0
    const warnings = []
    try {
      const pushPayload = variantSku
        ? { quantity: updated.stock, variantSku, variantStock: stockAfter, variants: updated.variants }
        : { quantity: updated.stock }
      const syncResults = await require('./fanOut').pushProductChanges(updated, pushPayload)
      pushedCount = syncResults.filter((r) => r.ok).length
      warnings.push(...syncResults.filter((r) => !r.ok).map((r) => `${r.shopName}: ${r.error}`))
    } catch (err) {
      console.warn('Listing sync failed during stock adjust:', err.message)
      warnings.push(`Listing sync error: ${err.message}`)
    }

    await require('../core/notify').stockChangedOnShops(updated, { was: stockBefore, stock: updated.stock }).catch(() => {})
    await events.publish({ type: 'sync', kind: 'listings', ok: true }).catch(() => {})

    return { stockBefore, stockAfter, change, log, pushedToMarketplaces: pushedCount, warnings }
}

/** POST /sync */
async function sync(ctx) {
    const listingFilter = { status: { $in: ['live', 'out_of_stock'] }, ...shopFilter(ctx, Listing) }
    const marketplace = canonicalMarketplace(ctx.body?.marketplace)
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
            variants: item.productId.variants,
            syncAllVariants: Boolean(item.productId.variants?.length),
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
    return { success: true, synced: successCount, failed: failCount }
}

module.exports = { lowStock, logs, adjust, sync }
