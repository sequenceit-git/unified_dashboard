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
    const marketplace = 'ebay'
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

/** A section file's own detail/action by name: never a name inherited from Object.prototype. */
function own(map, name) {
    return map && Object.hasOwn(map, name) && typeof map[name] === 'function' ? map[name] : null
}

/** The section (access checked) and its file's own detail or action; 404/403 before any eBay call. */
async function sectionPart(ctx, kind) {
    const marketplace = 'ebay'
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === ctx.params.sectionId)
    const file = section && require('../../sections')[section.id]
    const run = own(file?.[kind], ctx.params.actionId)
    if (!run) throw new HttpError(404, { error: 'No such action' })
    if (!canUseSection(ctx.authUser || ctx.user, marketplace, section.id, section.route)) {
      throw new HttpError(403, { error: `You do not have access to ${section.label} on this shop` })
    }
    const id = String((kind === 'details' ? ctx.query?.id : ctx.body?.id) ?? '').trim()
    return { section, run, id, shop: await connectedShop(ctx, marketplace) }
}

/** GET /sections/:sectionId/:actionId?id= — a read-only drill-down the section file exports. */
async function sectionDetail(ctx) {
    const { run, id, shop } = await sectionPart(ctx, 'details')
    if (!id) throw new HttpError(400, { error: 'id is required' })
    return marketplaceManager.withShopToken(shop, (token) => run(token, shop, id))
}

/** POST /sections/:sectionId/:actionId {id, value} — a row/table action the section file exports. */
async function sectionAction(ctx) {
    const { section, run, id, shop } = await sectionPart(ctx, 'actions')
    try {
      return await marketplaceManager.withShopToken(shop, (token) => run(token, shop, id, ctx.body?.value))
    } finally {
      await cache.del(`shop:${shop._id}:section:${section.id}`)
    }
}

/** POST /sections/offers/send */
async function sendOffer(ctx) {
    const marketplace = 'ebay'
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
    const marketplace = 'ebay'
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

/**
 * POST /sections/returns-cases/:actionId — one-click Returns & cases actions (mark received,
 * refund, inquiry refund/tracking, accept a payment dispute). Checks the section itself too, not
 * only the route guard.
 */
async function caseAction(ctx) {
    const marketplace = 'ebay'
    const { ACTIONS } = require('../../sections/returnsActions')
    const action = ACTIONS[ctx.params.actionId]
    if (!action) throw new HttpError(404, { error: 'No such action' })
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === 'returns-cases')
    if (!section || !canUseSection(ctx.authUser || ctx.user, marketplace, section.id, section.route)) {
      throw new HttpError(403, { error: `You do not have access to ${section?.label || 'Returns & cases'} on this shop` })
    }
    const id = String(ctx.body?.id || '').trim()
    if (!id) throw new HttpError(400, { error: 'id is required' })
    const shop = await connectedShop(ctx, marketplace)
    const { ebaySend, ebayUpload } = require('../../client')
    const { ebayApiz } = require('../../sections/helpers')
    const client = { postOrder: (...args) => SERVICE.postOrder(...args), ebaySend, upload: ebayUpload, apiz: ebayApiz() }
    const result = await marketplaceManager.withShopToken(shop, (token) => action.run(client, token, id, ctx.body.value))
    await cache.del(`shop:${shop._id}:section:returns-cases`)
    return result
}

/** POST /sections/buyers/reply — replies to one feedback; the buyer comes from eBay, not the browser. */
async function replyToFeedback(ctx) {
    const marketplace = 'ebay'
    const { MAX_REPLY } = require('../../sections/buyers')
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === 'buyers')
    if (!section || !canUseSection(ctx.authUser || ctx.user, marketplace, section.id, section.route)) {
      throw new HttpError(403, { error: `You do not have access to ${section?.label || 'Buyers'} on this shop` })
    }
    const feedbackId = String(ctx.body?.id || '').trim()
    const text = String(ctx.body?.value || '').trim()
    if (!feedbackId) throw new HttpError(400, { error: 'id is required' })
    if (!text) throw new HttpError(400, { error: 'Write a reply first.' })
    if (text.length > MAX_REPLY) throw new HttpError(400, { error: `eBay allows replies of up to ${MAX_REPLY} characters.` })
    const shop = await connectedShop(ctx, marketplace)
    if (!shop.accountUsername) throw new HttpError(400, { error: 'Reconnect eBay in Settings so the dashboard knows your eBay user name.' })
    const { ebayGet } = require('../../sections/helpers')
    const { ebaySend } = require('../../client')
    await marketplaceManager.withShopToken(shop, async (token) => {
      const found = await ebayGet(token, `/commerce/feedback/v1/feedback?user_id=${encodeURIComponent(shop.accountUsername)}&feedback_type=FEEDBACK_RECEIVED&feedback_id=${encodeURIComponent(feedbackId)}`)
      const recipient = found.feedbackEntries?.find((f) => f.feedbackId === feedbackId)?.providerUserDetail?.userId
      if (!recipient) throw new HttpError(404, { error: 'eBay has no such feedback for this shop.' })
      await ebaySend(token, 'POST', '/commerce/feedback/v1/respond_to_feedback', { feedbackId, recipientUserId: recipient, responseText: text, responseType: 'REPLY' })
    })
    await cache.del(`shop:${shop._id}:section:buyers`)
    return { message: 'Reply posted on eBay.' }
}

/** POST /sections/offers/<offer-accept|offer-decline|offer-counter> — answers one Best Offer. */
async function offerAction(ctx) {
    const marketplace = 'ebay'
    const ACTION = { 'offer-accept': 'Accept', 'offer-decline': 'Decline', 'offer-counter': 'Counter' }[ctx.params.actionId]
    if (!ACTION) throw new HttpError(404, { error: 'No such action' })
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === 'offers')
    if (!section || !canUseSection(ctx.authUser || ctx.user, marketplace, section.id, section.route)) {
      throw new HttpError(403, { error: `You do not have access to ${section?.label || 'Best offers'} on this shop` })
    }
    const [itemId, offerId, qty] = String(ctx.body?.id || '').split(':')
    if (!itemId || !offerId) throw new HttpError(400, { error: 'id must be <itemId>:<offerId>:<quantity>' })
    const shop = await connectedShop(ctx, marketplace)
    const trading = require('../../trading')
    const args = { itemId, offerId, action: ACTION, ...(ACTION === 'Counter' ? { counterPrice: Number(ctx.body.value), quantity: Math.max(1, Number(qty) || 1) } : {}) }
    try {
      await marketplaceManager.withShopToken(shop, (token) => trading.respondToBestOffer(token, args))
    } catch (err) {
      if (err.status === 400) throw new HttpError(400, { error: err.message })
      throw err
    }
    await cache.del(`shop:${shop._id}:section:offers`)
    const done = { Accept: 'accepted', Decline: 'declined', Counter: `countered at ${Number(ctx.body.value).toFixed(2)}` }[ACTION]
    return { message: `Offer ${done}.` }
}

/** POST /sections/cancellations/decide */
async function decideCancellation(ctx) {
    const marketplace = 'ebay'
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
    const marketplace = 'ebay'
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
    const marketplace = 'ebay'
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
    const marketplace = 'ebay'
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
    const marketplace = 'ebay'
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
    if (!canAccessShop(ctx, shop._id) || !canUseSection(ctx.authUser || ctx.user, shop.marketplace, 'payouts', 'analytics')) {
      throw new HttpError(403, { error: 'You do not have permission for this shop' })
    }
    const finances = await marketplaceManager.getFinances(shop)
    return finances || {}
}

module.exports = { connectedShop, section, sectionDetail, sectionAction, caseAction, replyToFeedback, offerAction, sendOffer, decideReturn, decideCancellation, createPromotion, pausePromotion, resumePromotion, shipPackage, setAiReply, categories, attributes, categoryRules, brands, sizeCharts, finances}
