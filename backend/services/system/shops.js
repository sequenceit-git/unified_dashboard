/** Generated from routes/system/shops.js: business logic behind the routes; routes only handle HTTP. */
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')
const registry = require('../../marketplaces')
const profiles = require('../../services/marketplace/profiles')
const sections = require('../../services/marketplace/sections')
const syncQueue = require('../../services/core/syncQueue')
const cache = require('../../services/core/cache')
const { HttpError } = require('../../utils/httpError')
const { canAccessShop, canUseSection, verifyOAuthState } = require('../../middleware/auth')

const { canonical: canonicalMarketplace } = registry
/** Default shop for the package routes: the first one whose API can fetch shipping documents. */
const PACKAGE_SHOP = registry.all().find((a) => typeof a.service.getShippingDocument === 'function')?.key

/**
 * Exchanges an OAuth code and saves the shop as connected. A reconnect updates the existing
 * shop in place (keeping its name), then queues a full sync and an API access check so the new
 * login's orders, listings and sections show up straight away.
 */
async function connectShop(marketplace, code, { shopName, externalShopId: requestedId } = {}) {
  const tokenData = await marketplaceManager.exchangeCode(marketplace, code)
  const existingMarketShop = tokenData.externalShopId
    ? null
    : await Shop.findOne({ marketplace }).select('externalShopId')
  const externalShopId = tokenData.externalShopId || requestedId || existingMarketShop?.externalShopId || `${marketplace}-us`
  const filter = { marketplace, externalShopId }
  const existingShop = await Shop.findOne(filter).select('name accountId')
  const accessToken = tokenData.access_token || tokenData.accessToken

  // eBay's token reply doesn't say which seller signed in, so ask. A login for a different
  // account than the connected shop's would otherwise overwrite that shop's tokens and mix two
  // sellers' orders and listings.
  let accountId = existingShop?.accountId
  const service = marketplaceManager.getService(marketplace)
  if (typeof service.getAccount === 'function') {
    try {
      const account = await service.getAccount(accessToken)
      if (account?.username) {
        const known = existingShop?.accountId
        if (known && known.toLowerCase() !== account.username.toLowerCase()) {
          throw Object.assign(new Error(
            `You signed in to ${config[marketplace]?.name || marketplace} as "${account.username}", but this shop is connected to "${known}". `
            + `Sign out of ${config[marketplace]?.name || marketplace}, then reconnect as "${known}".`,
          ), { wrongAccount: true })
        }
        accountId = account.username
      }
    } catch (err) {
      if (err.wrongAccount) throw err
      console.warn(`Could not check which ${marketplace} account connected: ${err.message}`)
    }
  }

  const shop = await Shop.findOneAndUpdate(
    existingShop ? { _id: existingShop._id } : filter,
    {
      $set: {
        name: shopName || tokenData.shopName || existingShop?.name || `${config[marketplace]?.name || marketplace} Store`,
        marketplace,
        externalShopId,
        shopCipher: tokenData.shopCipher,
        status: 'connected',
        // The seller's real username also replaces the inbox's best guess at it.
        ...(accountId ? { accountId, accountUsername: accountId } : {}),
        ...(Array.isArray(tokenData.grantedScopes) ? { grantedScopes: tokenData.grantedScopes } : {}),
        auth: {
          accessTokenEnc: accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: marketplaceManager.tokenExpiry(tokenData.expires_in),
        },
      },
      $unset: { authError: 1, apiAccess: 1, apiAccessCheckedAt: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  )

  // Re-probe section access immediately on reconnect so newly granted scopes unlock without stale flags.
  await syncQueue.enqueue('access', shop._id, { wait: true, timeoutMs: 15000 }).catch((err) => console.warn(`Initial access sync failed for ${shop.name}:`, err.message))
  for (const kind of ['full', 'live']) {
    syncQueue.enqueue(kind, shop._id).catch((err) => console.warn(`Initial ${kind} sync failed for ${shop.name}:`, err.message))
  }
  return shop
}

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

/** GET / */
async function list(ctx) {
    const filter = ctx.user.role === 'sub_admin' ? { _id: { $in: ctx.allowedShopIds } } : {}
    const shops = await Shop.find(filter).select('name marketplace status authError externalShopId lastSyncAt aiReplyEnabled liveUpdates').sort({ marketplace: 1 }).lean()
    return shops.map(({ liveUpdates, ...shop }) => ({
      ...shop,
      liveUpdates: liveUpdates ? { enabled: Boolean(liveUpdates.enabled), error: liveUpdates.error, enabledAt: liveUpdates.enabledAt } : undefined,
      listing: marketplaceManager.listingCapabilities(shop.marketplace),
    }))
}

/** GET /profiles */
async function getProfiles(ctx) {
    const filter = ctx.user.role === 'sub_admin' ? { _id: { $in: ctx.allowedShopIds } } : {}
    const refresh = ctx.query.refresh === '1' && ctx.user.role === 'super_admin'
    const shops = await Shop.find(filter).select('name marketplace status apiAccess apiAccessCheckedAt shopCipher grantedScopes')
    let list = await marketplaceManager.shopProfiles(shops, { refresh })
    if (ctx.user.role === 'sub_admin') list = list.filter((profile) => shops.some((shop) => shop.marketplace === profile.marketplace))
    return list
}

/** GET /sections/:sectionId */
async function section(ctx) {
    const marketplace = canonicalMarketplace(ctx.query.marketplace)
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === ctx.params.sectionId)
    if (!section || !sections.hasLoader(marketplace, section.id)) throw new HttpError(404, { error: 'This shop has no such section' })
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
      data = await marketplaceManager.withShopToken(shop, (token) => sections.load(marketplace, section.id, token, shop))
      data.loadedAt = new Date().toISOString()
      if (!data.tables.some((table) => table.error)) await cache.set(key, data, 10 * 60)
    }
    return { id: section.id, label: section.label, shopName: shop.name, ...data }
}

/** POST /sections/offers/send */
async function sendOffer(ctx) {
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const { listingId, discountPercentage = 10, message, allowCounterOffer = false } = ctx.body
    if (!listingId) throw new HttpError(400, { error: 'listingId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
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
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const { returnId, decision = 'APPROVE', comments, returnType, rawStatus, orderId } = ctx.body
    if (!returnId) throw new HttpError(400, { error: 'returnId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
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
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const { cancelId, action = 'approve', trackingNumber, shipmentDate, orderId } = ctx.body
    if (!cancelId) throw new HttpError(400, { error: 'cancelId is required' })

    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.decideCancellation !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support cancellation decisions via API` })
    }

    let resolvedTracking = trackingNumber
    let resolvedShipmentDate = shipmentDate
    if (String(action).toLowerCase() === 'reject' && !resolvedTracking && orderId) {
      const Order = require('../../models/Order')
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
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const { name, description, percentageOff, listingIds, startDate, endDate } = ctx.body

    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.createPromotion !== 'function') {
      throw new HttpError(400, { error: `${marketplace} does not support creating promotions via API` })
    }

    let finalListingIds = Array.isArray(listingIds) ? listingIds.map((id) => String(id).trim()).filter(Boolean) : []
    let imageUrl
    const targets = registry.get(marketplace).hooks?.promotionTargets
    if (targets) ({ listingIds: finalListingIds, imageUrl } = await targets(marketplaceManager, shop, finalListingIds))

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.createPromotion(token, { name, description, percentageOff, listingIds: finalListingIds, startDate, endDate, imageUrl, shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    return { success: true, result }
}

/** POST /sections/promotions/:id/pause */
async function pausePromotion(ctx) {
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
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
    const marketplace = canonicalMarketplace(ctx.body.marketplace || ctx.query.marketplace || registry.KEYS[0])
    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
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
    const marketplace = canonicalMarketplace(ctx.body?.marketplace || ctx.query.marketplace || PACKAGE_SHOP)
    const shop = await connectedShop(ctx, marketplace)

    const service = marketplaceManager.getService(marketplace)
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

/** POST /oauth/callback/:marketplace */
async function oauthCallback(ctx) {
    const marketplace = canonicalMarketplace(ctx.params.marketplace)
    if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
    const { code, shopName, state } = ctx.body
    if (!code) throw new HttpError(400, { error: 'Authorization code is required' })
    if (!state || !verifyOAuthState(state, marketplace, ctx.user.id)) {
      throw new HttpError(400, { error: 'Invalid or expired connect request. Start the connection again from Settings.' })
    }

    const shop = await connectShop(marketplace, code, { shopName, externalShopId: ctx.body.externalShopId })
    const safeShop = shop.toObject()
    delete safeShop.auth
    return { success: true, shop: safeShop }
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
    if (!canAccessShop(ctx, shop._id) || !canUseSection(ctx.authUser || ctx.user, shop.marketplace, 'finances', 'analytics')) {
      throw new HttpError(403, { error: 'You do not have permission for this shop' })
    }
    const finances = await marketplaceManager.getFinances(shop)
    return finances || {}
}

/** POST /sync-all */
async function syncAll(ctx) {
    const filter = { status: 'connected' }
    if (ctx.user.role === 'sub_admin') {
      filter._id = { $in: ctx.allowedShopIds }
    }
    const shops = await Shop.find(filter).select('_id')
    const results = await Promise.all(shops.map((shop) => syncQueue.enqueue('full', shop._id, { wait: true })))
    return { success: true, results }
}

/** POST /:id/live-updates */
async function liveUpdates(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('_id marketplace')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!registry.KEYS.includes(shop.marketplace) || !registry.get(shop.marketplace).webhooks) {
      throw new HttpError(400, { error: 'Live updates are only available for eBay, TikTok Shop and Temu' })
    }
    const result = await syncQueue.enqueue('live', shop._id, { wait: true, timeoutMs: 20000 })
    return { success: true, result }
}

/** POST /:id/sync */
async function sync(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('_id')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const result = await syncQueue.enqueue('full', shop._id, { wait: true })
    return { success: true, result }
}

module.exports = { connectedShop, connectShop, list, getProfiles, section, sendOffer, decideReturn, decideCancellation, createPromotion, pausePromotion, resumePromotion, shipPackage, setAiReply, oauthCallback, categories, attributes, categoryRules, brands, sizeCharts, finances, syncAll, liveUpdates, sync }
