/** Generated from routes/system/shops.js: business logic behind the routes; routes only handle HTTP. */
const Shop = require('../../../../models/Shop')
const marketplaceManager = require('../manager')
const config = require('../../../../config/marketplaces')
const profiles = require('../../../../services/marketplace/profiles')
const syncQueue = require('../../../../services/core/syncQueue')
const cache = require('../../../../services/core/cache')
const { HttpError } = require('../../../../utils/httpError')
const { canAccessShop, canUseSection } = require('../../../../middleware/auth')
const ADAPTER = require('../..')
const SERVICE = ADAPTER.service

/** The connected shop for a marketplace this user may use; HttpError 403/404 otherwise. */
async function connectedShop(ctx, marketplace) {
  const filter = { marketplace, status: 'connected' }
  if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
  const shop = await Shop.findOne(filter)
  if (shop) return shop
  if (ctx.user.role === 'sub_admin' && await Shop.exists({ marketplace, status: 'connected' })) {
    throw new HttpError(403, { error: 'You do not have permission for this shop' })
  }
  throw new HttpError(404, { error: `No connected ${marketplace} shop` })
}

/** GET /sections/:sectionId */
async function section(ctx) {
    const marketplace = 'tiktok_shop'
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === ctx.params.sectionId)
    if (!section || typeof ADAPTER.sections[section.id] !== 'function') throw new HttpError(404, { error: 'This shop has no such section' })
    const user = ctx.authUser || ctx.user
    if (!canUseSection(user, marketplace, section.id, section.route)) {
      throw new HttpError(403, { error: `You do not have access to ${section.label} on this shop` })
    }
    const filter = { marketplace, status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: `No connected ${config[marketplace]?.name || marketplace} shop` })
    if (shop.apiAccess?.[section.id]?.ok === false) {
      throw new HttpError(403, { error: `${section.label} isn't available for this shop: ${shop.apiAccess[section.id].reason}` })
    }
    // Cleared by every orders sync of this shop; ?refresh=1 loads it fresh.
    const key = `shop:${shop._id}:section:${section.id}`
    let data = ctx.query.refresh === '1' ? undefined : await cache.get(key)
    if (data === undefined) {
      data = await marketplaceManager.withShopToken(shop, (token) => ADAPTER.sections[section.id](token, shop))
      data.loadedAt = new Date().toISOString()
      if (!data.tables.some((table) => table.error)) await cache.set(key, data, 10 * 60)
    }
    return { id: section.id, label: section.label, shopName: shop.name, ...data }
}

/** POST /sections/offers/send */
async function sendOffer(ctx) {
    const marketplace = 'tiktok_shop'
    const { listingId, discountPercentage = 10, message, allowCounterOffer = false } = ctx.body
    if (!listingId) throw new HttpError(400, { error: 'listingId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.sendBuyerOffer !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support sending buyer offers` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.sendBuyerOffer(token, listingId, { discountPercentage, message, allowCounterOffer })
    )

    await cache.del(`shop:${shop._id}:section:offers`)
    return { success: true, result }
}

/** POST /sections/returns/decide */
async function decideReturn(ctx) {
    const marketplace = 'tiktok_shop'
    const { returnId, decision = 'APPROVE', comments, returnType, rawStatus, orderId } = ctx.body
    if (!returnId) throw new HttpError(400, { error: 'returnId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.decideReturn !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support return decisions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.decideReturn(token, returnId, { decision, comments, returnType, rawStatus, orderId, shop })
    )

    await cache.del(`shop:${shop._id}:section:returns`)
    syncQueue.enqueue('orders', shop._id, { push: true }).catch(() => {})
    syncQueue.enqueue('listings', shop._id, { push: true }).catch(() => {})
    return { success: true, result }
}

/** POST /sections/cancellations/decide */
async function decideCancellation(ctx) {
    const marketplace = 'tiktok_shop'
    const { cancelId, action = 'approve', trackingNumber, shipmentDate, orderId } = ctx.body
    if (!cancelId) throw new HttpError(400, { error: 'cancelId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.decideCancellation !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support cancellation decisions via API` })
    }

    let resolvedTracking = trackingNumber
    let resolvedShipmentDate = shipmentDate
    if (String(action).toLowerCase() === 'reject' && !resolvedTracking && orderId) {
      const Order = require('../../../../models/Order')
      const order = await Order.findOne({ shopId: shop._id, externalOrderId: String(orderId) }).select('shipping').lean()
      if (order?.shipping?.trackingNumber) {
        resolvedTracking = order.shipping.trackingNumber
        if (!resolvedShipmentDate && order.shipping.shippedAt) {
          resolvedShipmentDate = new Date(order.shipping.shippedAt).toISOString()
        }
      }
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.decideCancellation(token, cancelId, { action, trackingNumber: resolvedTracking, shipmentDate: resolvedShipmentDate, orderId, shop })
    )

    await cache.del(`shop:${shop._id}:section:returns`)
    syncQueue.enqueue('orders', shop._id, { push: true }).catch(() => {})
    syncQueue.enqueue('listings', shop._id, { push: true }).catch(() => {})
    return { success: true, result }
}

/** POST /sections/promotions/create */
async function createPromotion(ctx) {
    const marketplace = 'tiktok_shop'
    const { name, description, percentageOff, listingIds, startDate, endDate } = ctx.body

    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.createPromotion !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support creating promotions via API` })
    }

    let finalListingIds = Array.isArray(listingIds) ? listingIds.map((id) => String(id).trim()).filter(Boolean) : []
    let imageUrl
    const targets = ADAPTER.hooks?.promotionTargets
    if (targets) ({ listingIds: finalListingIds, imageUrl } = await targets(marketplaceManager, shop, finalListingIds))

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.createPromotion(token, { name, description, percentageOff, listingIds: finalListingIds, startDate, endDate, imageUrl, shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    return { success: true, result }
}

/** POST /sections/promotions/:id/pause */
async function pausePromotion(ctx) {
    const marketplace = 'tiktok_shop'
    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.pausePromotion !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support pausing promotions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.pausePromotion(token, ctx.params.id, { shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    return { success: true, result }
}

/** POST /sections/promotions/:id/resume */
async function resumePromotion(ctx) {
    const marketplace = 'tiktok_shop'
    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.resumePromotion !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support resuming promotions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.resumePromotion(token, ctx.params.id, { shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    return { success: true, result }
}

/** POST /sections/fulfillment/:packageId/ship */
async function shipPackage(ctx) {
    const marketplace = 'tiktok_shop'
    const shop = await connectedShop(ctx, marketplace)

    const service = SERVICE
    if (typeof service.shipPackage !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support package handover shipping` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.shipPackage(token, ctx.params.packageId, { handoverMethod: ctx.body?.handoverMethod || 'DROP_OFF', shop })
    )

    await cache.del(`shop:${shop._id}:section:fulfillment`)
    syncQueue.enqueue('orders', shop._id, { push: true }).catch(() => {})
    return { success: true, result }
}

/** PATCH /:id/ai-reply */
async function setAiReply(ctx) {
    const shop = await Shop.findByIdAndUpdate(
      ctx.params.id,
      { aiReplyEnabled: Boolean(ctx.body.enabled) },
      { returnDocument: 'after' },
    ).select('name marketplace status aiReplyEnabled')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    return shop
}

/** GET /:id/categories */
async function categories(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const query = String(ctx.query.q || '').trim().toLowerCase()
    const mode = ctx.query.mode === 'search' ? 'search' : 'auto'
    const categories = await cache.wrap(
      `taxonomy:v2:${shop._id}:categories:${mode}:${query}`,
      6 * 3600,
      async () => (await marketplaceManager.getCategories(shop, ctx.query.q, { mode })) || [],
    )
    return categories
}

/** GET /:id/categories/:categoryId/attributes */
async function attributes(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const attributes = await cache.wrap(
      `taxonomy:v3:${shop._id}:attributes:${ctx.params.categoryId}`,
      24 * 3600,
      async () => (await marketplaceManager.getCategoryAttributes(shop, ctx.params.categoryId)) || [],
    )
    return attributes
}

/** GET /:id/categories/:categoryId/rules */
async function categoryRules(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const rules = await cache.wrap(
      `taxonomy:v3:${shop._id}:rules:${ctx.params.categoryId}`,
      24 * 3600,
      async () => (await marketplaceManager.getCategoryRules(shop, ctx.params.categoryId)) || [],
    )
    return rules
}

/** GET /:id/brands */
async function brands(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const categoryId = String(ctx.query.categoryId || '').trim()
    const query = String(ctx.query.q || '').trim()
    const authorizedOnly = ctx.query.authorizedOnly === '1' || ctx.query.authorizedOnly === 'true'
    const brands = await cache.wrap(
      `taxonomy:v2:${shop._id}:brands:${categoryId}:${query.toLowerCase()}:${authorizedOnly ? 1 : 0}`,
      3600,
      async () => (await marketplaceManager.getBrands(shop, { categoryId, query, authorizedOnly })) || [],
    )
    return brands
}

/** GET /:id/size-charts */
async function sizeCharts(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const query = String(ctx.query.q || '').trim()
    const charts = await cache.wrap(
      `taxonomy:v2:${shop._id}:sizecharts:${query.toLowerCase()}`,
      10 * 60,
      async () => (await marketplaceManager.getSizeCharts(shop, { query })) || [],
    )
    return charts
}

/** GET /:id/finances */
async function finances(ctx) {
    const shop = await Shop.findById(ctx.params.id)
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id) || !canUseSection(ctx.authUser || ctx.user, shop.marketplace, 'finance', 'analytics')) {
      throw new HttpError(403, { error: 'You do not have permission for this shop' })
    }
    const finances = await marketplaceManager.getFinances(shop)
    return finances || {}
}

module.exports = { connectedShop, section, sendOffer, decideReturn, decideCancellation, createPromotion, pausePromotion, resumePromotion, shipPackage, setAiReply, categories, attributes, categoryRules, brands, sizeCharts, finances}
