/** Generated from routes/catalog/inventory.js: business logic behind the routes; routes only handle HTTP. */
const { paging, paged, escapeRegex } = require('../../../../utils/query')
const InventoryLog = require('../../../../models/InventoryLog')
const Product = require('../../../../models/Product')
const Listing = require('../../../../models/Listing')
const marketplaceManager = require('../manager')
const events = require('../../../../services/core/events')
const { HttpError } = require('../../../../utils/httpError')
const { shopFilter, canAccessShop } = require('../../../../middleware/auth')
const { assertProductAccess } = require('../../../../services/productAccess')

/** GET /low-stock */
async function lowStock(ctx) {
    const listingFilter = {}
    if (ctx.user.role === 'sub_admin') listingFilter.shopId = { $in: ctx.allowedShopIds }
    const marketplace = 'tiktok_shop'
    if (marketplace) listingFilter.marketplace = marketplace
    const filter = { marketplace: 'tiktok_shop', $expr: { $lte: ['$stock', '$lowStockThreshold'] } }
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
      const marketplace = 'tiktok_shop'
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
        marketplace: 'tiktok_shop',
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
    const product = await Product.findOne({ _id: productId, marketplace: 'tiktok_shop' })
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
      const syncResults = await marketplaceManager.pushProductChanges(updated, pushPayload)
      pushedCount = syncResults.filter((r) => r.ok).length
      warnings.push(...syncResults.filter((r) => !r.ok).map((r) => `${r.shopName}: ${r.error}`))
    } catch (err) {
      console.warn('Listing sync failed during stock adjust:', err.message)
      warnings.push(`Listing sync error: ${err.message}`)
    }

    await require('../../../../services/core/notify').stockChangedOnShops(updated, { was: stockBefore, stock: updated.stock }).catch(() => {})
    await events.publish({ type: 'sync', kind: 'listings', ok: true }).catch(() => {})

    return { stockBefore, stockAfter, change, log, pushedToMarketplaces: pushedCount, warnings }
}

/** POST /sync */
async function sync(ctx) {
    const listingFilter = { status: { $in: ['live', 'out_of_stock'] }, ...shopFilter(ctx, Listing) }
    const marketplace = 'tiktok_shop'
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

/**
 * GET /tiktok-stock — stock TikTok holds per SKU (and per warehouse) next to the dashboard's stock
 * for the same SKU. Mismatches first, then matches, then SKUs the dashboard doesn't know.
 */
async function tiktokStock(ctx) {
    const Shop = require('../../../../models/Shop')
    const filter = { marketplace: 'tiktok_shop', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: 'No connected TikTok Shop' })
    const listings = await Listing.find({ shopId: shop._id, marketplace: 'tiktok_shop', externalListingId: { $exists: true, $ne: '' } }).select('externalListingId productId').lean()
    const products = await Product.find({ _id: { $in: listings.map((l) => l.productId) } }).select('title sku stock variants').lean()
    const productById = new Map(products.map((p) => [String(p._id), p]))
    const productByTikTokId = new Map(listings.map((l) => [String(l.externalListingId), productById.get(String(l.productId))]))
    const ids = [...new Set(listings.map((l) => String(l.externalListingId)))]
    const tiktok = require('../../service')
    const inventory = []
    await marketplaceManager.withShopToken(shop, async (token) => {
      for (let i = 0; i < ids.length; i += 50) {
        const res = await tiktok.call(token, 'POST', '/product/202309/inventory/search', { shop, body: { product_ids: ids.slice(i, i + 50) } })
        inventory.push(...(res.inventory || []))
      }
    })
    const rows = inventory.flatMap((item) => {
      const product = productByTikTokId.get(String(item.product_id))
      return (item.skus || []).map((sku) => {
        const variant = product?.variants?.find((v) => v.sku && v.sku === sku.seller_sku)
        const single = product && !(product.variants || []).length
        const dashboardStock = variant ? variant.stock ?? 0 : single ? product.stock ?? 0 : null
        const tiktokTotal = sku.total_available_quantity ?? 0
        return {
          sku: sku.seller_sku || sku.id,
          tiktokSkuId: sku.id,
          productId: String(item.product_id),
          product: product?.title || '',
          warehouses: (sku.warehouse_inventory || []).map((w) => ({ name: w.warehouse_id, available: w.available_quantity ?? 0 })),
          tiktokTotal,
          dashboardStock,
          mismatch: dashboardStock != null && dashboardStock !== tiktokTotal,
        }
      })
    })
    const rank = (r) => (r.mismatch ? 0 : r.dashboardStock == null ? 2 : 1)
    return rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r)
}

/**
 * POST /tiktok-stock/fix { productId, skuId } — "Use dashboard stock": sends the dashboard's stock
 * for that TikTok SKU (worked out here, never taken from the page). A SKU whose stock is spread over
 * several warehouses is left to Seller Center, so no warehouse is emptied by accident.
 */
async function fixTikTokStock(ctx) {
    const productId = String(ctx.body?.productId || '')
    const skuId = String(ctx.body?.skuId || '')
    if (!/^\d+$/.test(productId) || !/^[\w-]+$/.test(skuId)) throw new HttpError(400, { error: 'Unknown TikTok SKU' })
    const row = (await tiktokStock(ctx)).find((r) => r.productId === productId && r.tiktokSkuId === skuId)
    if (!row || row.dashboardStock == null) throw new HttpError(400, { error: 'The dashboard has no stock for this TikTok SKU. Link it to a product first, or change it in TikTok Seller Center.' })
    if (row.warehouses.filter((w) => w.available > 0).length > 1) {
      throw new HttpError(400, { error: `${row.sku} has stock in more than one warehouse on TikTok. Change it in TikTok Seller Center.` })
    }
    const Shop = require('../../../../models/Shop')
    const filter = { marketplace: 'tiktok_shop', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    const tiktok = require('../../service')
    await marketplaceManager.withShopToken(shop, (token) => tiktok.updateStock(token, null, row.dashboardStock, { externalListingId: `${productId}:${skuId}`, shop }))
    return { message: `TikTok now has ${row.dashboardStock} for ${row.sku || skuId}.` }
}

module.exports = { lowStock, logs, adjust, sync, tiktokStock, fixTikTokStock }
