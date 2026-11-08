const express = require('express')
const { requireAuth, loadAccess, requireRole, canUseSection, canAccessShop, signOAuthState, verifyOAuthState } = require('../../middleware/auth')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')
const { canonicalMarketplace } = require('../../utils/marketplace')
const profiles = require('../../services/marketplace/profiles')
const sections = require('../../services/marketplace/sections')
const syncQueue = require('../../services/syncQueue')
const cache = require('../../services/cache')

const router = express.Router()

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
        auth: {
          accessTokenEnc: accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: marketplaceManager.tokenExpiry(tokenData.expires_in),
        },
      },
      $unset: { authError: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  )

  // First load of orders and listings, and which sections the new login can reach.
  for (const kind of ['full', 'access']) {
    syncQueue.enqueue(kind, shop._id).catch((err) => console.warn(`Initial ${kind} sync failed for ${shop.name}:`, err.message))
  }
  return shop
}

// GET /api/shops/oauth/callback/:marketplace — Browser redirect callback from eBay OAuth
router.get('/oauth/callback/:marketplace', async (req, res) => {
  try {
    const { marketplace } = req.params
    const code = req.query.code
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()

    if (!code) {
      return res.redirect(`${clientUrl}/settings?error=${encodeURIComponent('no_code')}`)
    }

    const market = canonicalMarketplace(marketplace)
    if (!market) return res.redirect(`${clientUrl}/settings?error=${encodeURIComponent('Unknown marketplace')}`)
    // This route has no login, so only a connect flow a super admin started here may complete it.
    if (!verifyOAuthState(req.query.state, market)) {
      return res.redirect(`${clientUrl}/settings?error=${encodeURIComponent('Invalid or expired connect request. Start the connection again from Settings.')}`)
    }
    await connectShop(market, code)

    res.redirect(`${clientUrl}/settings?connected=${market}`)
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()
    res.redirect(`${clientUrl}/settings?error=${encodeURIComponent(err.message)}`)
  }
})

router.use(requireAuth, loadAccess)

/**
 * Guards a shop-section write: the user needs the section's main route and, when they have a
 * restricted `allowedSections` list, the section itself on that marketplace.
 */
function sectionGuard(sectionId, defaultMarketplace = 'ebay') {
  return (req, res, next) => {
    const marketplace = canonicalMarketplace(req.body?.marketplace || req.query.marketplace || defaultMarketplace)
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === sectionId)
    if (!section || !canUseSection(req.authUser || req.user, marketplace, sectionId, section.route)) {
      return res.status(403).json({ error: `You do not have access to ${section?.label || sectionId} on this shop` })
    }
    next()
  }
}

// GET /api/shops — id/name/marketplace for dropdowns and tabs.
// Sub-admins only see their own shop.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'sub_admin' ? { _id: { $in: req.allowedShopIds } } : {}
    const shops = await Shop.find(filter).select('name marketplace status authError externalShopId lastSyncAt aiReplyEnabled').sort({ marketplace: 1 }).lean()
    res.json(shops.map((shop) => ({ ...shop, listing: marketplaceManager.listingCapabilities(shop.marketplace) })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/profiles?refresh=1 — each shop's sections, status names and product form,
// with the sections its API access allows. Sub-admins only get their marketplaces.
router.get('/profiles', async (req, res) => {
  try {
    const filter = req.user.role === 'sub_admin' ? { _id: { $in: req.allowedShopIds } } : {}
    const refresh = req.query.refresh === '1' && req.user.role === 'super_admin'
    const shops = await Shop.find(filter).select('name marketplace status apiAccess apiAccessCheckedAt shopCipher')
    let list = await marketplaceManager.shopProfiles(shops, { refresh })
    if (req.user.role === 'sub_admin') list = list.filter((profile) => shops.some((shop) => shop.marketplace === profile.marketplace))
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/sections/:sectionId?marketplace=ebay — data for a shop-specific section.
router.get('/sections/:sectionId', async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.query.marketplace)
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === req.params.sectionId)
    if (!section || !sections.hasLoader(marketplace, section.id)) return res.status(404).json({ error: 'This shop has no such section' })
    const user = req.authUser || req.user
    if (!canUseSection(user, marketplace, section.id, section.route)) {
      return res.status(403).json({ error: `You do not have access to ${section.label} on this shop` })
    }
    const filter = { marketplace, status: 'connected' }
    if (req.user.role === 'sub_admin') filter._id = { $in: req.allowedShopIds }
    const shop = await Shop.findOne(filter)
    if (!shop) return res.status(404).json({ error: `No connected ${config[marketplace]?.name || marketplace} shop` })
    if (shop.apiAccess?.[section.id]?.ok === false) {
      return res.status(403).json({ error: `${section.label} isn't available for this shop: ${shop.apiAccess[section.id].reason}` })
    }
    // Cleared by every orders sync of this shop; ?refresh=1 loads it fresh.
    const key = `shop:${shop._id}:section:${section.id}`
    let data = req.query.refresh === '1' ? undefined : await cache.get(key)
    if (data === undefined) {
      data = await marketplaceManager.withShopToken(shop, (token) => sections.load(marketplace, section.id, token, shop))
      data.loadedAt = new Date().toISOString()
      if (!data.tables.some((table) => table.error)) await cache.set(key, data, 10 * 60)
    }
    res.json({ id: section.id, label: section.label, shopName: shop.name, ...data })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// POST /api/shops/sections/offers/send — send discount offer to interested buyers on eBay
router.post('/sections/offers/send', sectionGuard('offers'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const { listingId, discountPercentage = 10, message, allowCounterOffer = false } = req.body
    if (!listingId) return res.status(400).json({ error: 'listingId is required' })

    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.sendBuyerOffer !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support sending buyer offers` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.sendBuyerOffer(token, listingId, { discountPercentage, message, allowCounterOffer })
    )

    await cache.del(`shop:${shop._id}:section:offers`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/returns/decide — approve or decline buyer return on eBay
router.post('/sections/returns/decide', sectionGuard('returns'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const { returnId, decision = 'APPROVE', comments } = req.body
    if (!returnId) return res.status(400).json({ error: 'returnId is required' })

    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.decideReturn !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support return decisions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.decideReturn(token, returnId, { decision, comments, shop })
    )

    await cache.del(`shop:${shop._id}:section:returns`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/cancellations/decide — approve or reject cancellation request on eBay/TikTok
router.post('/sections/cancellations/decide', sectionGuard('returns'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const { cancelId, action = 'approve', trackingNumber, shipmentDate } = req.body
    if (!cancelId) return res.status(400).json({ error: 'cancelId is required' })

    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.decideCancellation !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support cancellation decisions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.decideCancellation(token, cancelId, { action, trackingNumber, shipmentDate, shop })
    )

    await cache.del(`shop:${shop._id}:section:returns`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/create — create promotional campaign on eBay/TikTok
router.post('/sections/promotions/create', sectionGuard('promotions'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const { name, description, percentageOff, listingIds, startDate, endDate } = req.body

    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.createPromotion !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support creating promotions via API` })
    }

    // eBay sales need a picture; use the first listed item's product image.
    let imageUrl
    if (marketplace === 'ebay' && Array.isArray(listingIds) && listingIds.length) {
      const Listing = require('../../models/Listing')
      const first = String(listingIds[0]).trim()
      const listing = await Listing.findOne({ shopId: shop._id, externalListingId: { $in: [first, `item-${first}`] } })
        .populate('productId', 'images').lean()
      imageUrl = marketplaceManager.publicImageUrls(listing?.productId?.images || [])[0]
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.createPromotion(token, { name, description, percentageOff, listingIds, startDate, endDate, imageUrl, shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/:id/pause — pause active promotion
router.post('/sections/promotions/:id/pause', sectionGuard('promotions'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.pausePromotion !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support pausing promotions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.pausePromotion(token, req.params.id, { shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/:id/resume — resume paused promotion
router.post('/sections/promotions/:id/resume', sectionGuard('promotions'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.body.marketplace || req.query.marketplace || 'ebay')
    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.resumePromotion !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support resuming promotions via API` })
    }

    const result = await marketplaceManager.withShopToken(shop, (token) =>
      service.resumePromotion(token, req.params.id, { shop })
    )

    await cache.del(`shop:${shop._id}:section:promotions`)
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/shops/sections/fulfillment/:packageId/label — fetch package shipping document from TikTok Shop
router.get('/sections/fulfillment/:packageId/label', sectionGuard('fulfillment', 'tiktok_shop'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.query.marketplace || 'tiktok_shop')
    const shop = await Shop.findOne({ marketplace, status: 'connected' })
    if (!shop) return res.status(404).json({ error: `No connected ${marketplace} shop` })
    if (req.user.role === 'sub_admin' && !req.allowedShopIds.some((id) => String(id) === String(shop._id))) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }

    const service = marketplaceManager.getService(marketplace)
    if (typeof service.getShippingDocument !== 'function') {
      return res.status(400).json({ error: `${marketplace} does not support shipping document downloads` })
    }

    const doc = await marketplaceManager.withShopToken(shop, (token) =>
      service.getShippingDocument(token, req.params.packageId, { shop })
    )
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/shops/:id/ai-reply — { enabled } turns the inbox auto-reply on or off for a shop
router.patch('/:id/ai-reply', requireRole('super_admin'), async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { aiReplyEnabled: Boolean(req.body.enabled) },
      { returnDocument: 'after' },
    ).select('name marketplace status aiReplyEnabled')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    res.json(shop)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/shops/configs — Check configuration status for eBay marketplace
router.get('/configs', requireRole('super_admin'), (req, res) => {
  res.json({
    ebay: {
      configured: Boolean(config.ebay?.clientId && config.ebay?.clientSecret),
      environment: config.ebay?.environment || 'PRODUCTION',
      ruNameConfigured: Boolean(config.ebay?.ruName),
    },
    tiktok_shop: {
      configured: Boolean(config.tiktok_shop?.appKey && config.tiktok_shop?.appSecret && config.tiktok_shop?.serviceId),
      environment: 'US',
    },
    temu: {
      configured: Boolean(config.temu?.appKey && config.temu?.appSecret),
      environment: 'US',
    },
  })
})

// GET /api/shops/oauth/connect/:marketplace — Generate OAuth connect URL
router.get('/oauth/connect/:marketplace', requireRole('super_admin'), (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.params.marketplace)
    if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
    const state = signOAuthState(req.user.id, marketplace)
    const url = marketplaceManager.getAuthUrl(marketplace, state)
    res.json({ url, state })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/oauth/callback/:marketplace — Exchange code and connect shop
router.post('/oauth/callback/:marketplace', requireRole('super_admin'), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.params.marketplace)
    if (!marketplace) return res.status(400).json({ error: 'Unknown marketplace' })
    const { code, shopName, state } = req.body
    if (!code) return res.status(400).json({ error: 'Authorization code is required' })
    if (state && !verifyOAuthState(state, marketplace, req.user.id)) {
      return res.status(400).json({ error: 'Invalid or expired connect request. Start the connection again from Settings.' })
    }

    const shop = await connectShop(marketplace, code, { shopName, externalShopId: req.body.externalShopId })
    res.json({ success: true, shop })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories — Fetch marketplace taxonomy categories
router.get('/:id/categories', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    if (!canAccessShop(req, shop._id)) return res.status(403).json({ error: 'You do not have permission for this shop' })
    const query = String(req.query.q || '').trim().toLowerCase()
    const categories = await cache.wrap(`taxonomy:${shop._id}:categories:${query}`, 6 * 3600, async () => (await marketplaceManager.getCategories(shop, req.query.q)) || [])
    res.json(categories)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories/:categoryId/attributes — Category attribute schema
router.get('/:id/categories/:categoryId/attributes', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    if (!canAccessShop(req, shop._id)) return res.status(403).json({ error: 'You do not have permission for this shop' })
    const attributes = await cache.wrap(`taxonomy:${shop._id}:attributes:${req.params.categoryId}`, 24 * 3600, async () => (await marketplaceManager.getCategoryAttributes(shop, req.params.categoryId)) || [])
    res.json(attributes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories/:categoryId/rules — certifications required for this category
router.get('/:id/categories/:categoryId/rules', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    if (!canAccessShop(req, shop._id)) return res.status(403).json({ error: 'You do not have permission for this shop' })
    const rules = await cache.wrap(
      `taxonomy:${shop._id}:rules:${req.params.categoryId}`,
      24 * 3600,
      async () => (await marketplaceManager.getCategoryRules(shop, req.params.categoryId)) || [],
    )
    res.json(rules)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/finances — Settlement and fee breakdown
router.get('/:id/finances', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id)
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    if (!canAccessShop(req, shop._id) || !canUseSection(req.authUser || req.user, shop.marketplace, 'finances', 'analytics')) {
      return res.status(403).json({ error: 'You do not have permission for this shop' })
    }
    const finances = await marketplaceManager.getFinances(shop)
    res.json(finances || {})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/sync-all — Synchronizes orders, customers, and product listings from all shops
router.post('/sync-all', async (req, res) => {
  try {
    const filter = { status: 'connected' }
    if (req.user.role === 'sub_admin') {
      filter._id = { $in: req.allowedShopIds }
    }
    const shops = await Shop.find(filter).select('_id')
    const results = await Promise.all(shops.map((shop) => syncQueue.enqueue('full', shop._id, { wait: true })))
    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/:id/sync — Synchronize specific shop
router.post('/:id/sync', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('_id')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    if (!canAccessShop(req, shop._id)) return res.status(403).json({ error: 'You do not have permission for this shop' })
    const result = await syncQueue.enqueue('full', shop._id, { wait: true })
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

