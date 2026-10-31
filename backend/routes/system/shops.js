const express = require('express')
const { requireAuth, loadAccess, requireRole } = require('../../middleware/auth')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')
const { canonicalMarketplace } = require('../../utils/marketplace')
const profiles = require('../../services/marketplace/profiles')
const sections = require('../../services/marketplace/sections')
const syncQueue = require('../../services/syncQueue')
const cache = require('../../services/cache')

const router = express.Router()

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
    const tokenData = await marketplaceManager.exchangeCode(market, code)
    const existing = tokenData.externalShopId
      ? null
      : await Shop.findOne({ marketplace: market }).select('externalShopId')
    const externalShopId = tokenData.externalShopId || existing?.externalShopId || `${market}-us`

    await Shop.findOneAndUpdate(
      { marketplace: market, externalShopId },
      {
        name: tokenData.shopName || `${config[market]?.name || market} Store`,
        marketplace: market,
        externalShopId,
        shopCipher: tokenData.shopCipher,
        status: 'connected',
        auth: {
          accessTokenEnc: tokenData.access_token || tokenData.accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: marketplaceManager.tokenExpiry(tokenData.expires_in),
        },
        lastSyncAt: new Date(),
      },
      { upsert: true, new: true },
    )

    res.redirect(`${clientUrl}/settings?connected=${market}`)
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()
    res.redirect(`${clientUrl}/settings?error=${encodeURIComponent(err.message)}`)
  }
})

router.use(requireAuth, loadAccess)

// GET /api/shops — id/name/marketplace for dropdowns and tabs.
// Sub-admins only see their own shop.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'sub_admin' ? { _id: { $in: req.allowedShopIds } } : {}
    const shops = await Shop.find(filter).select('name marketplace status externalShopId lastSyncAt aiReplyEnabled').sort({ marketplace: 1 }).lean()
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
    if (user.role !== 'super_admin' && !user.mainRoutes?.includes(section.route)) {
      return res.status(403).json({ error: `You do not have access to the ${section.route} section` })
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
    const state = req.query.state || `${marketplace}-${Date.now()}`
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
    const { code, shopName } = req.body
    if (!code) return res.status(400).json({ error: 'Authorization code is required' })

    const tokenData = await marketplaceManager.exchangeCode(marketplace, code)
    const existingMarketShop = tokenData.externalShopId
      ? null
      : await Shop.findOne({ marketplace }).select('externalShopId')
    const externalShopId = tokenData.externalShopId || req.body.externalShopId || existingMarketShop?.externalShopId || `${marketplace}-us`
    const filter = { marketplace, externalShopId }
    const existingShop = await Shop.findOne(filter)

    const shop = await Shop.findOneAndUpdate(
      existingShop ? { _id: existingShop._id } : filter,
      {
        name: shopName || tokenData.shopName || existingShop?.name || `${config[marketplace]?.name || marketplace} Store`,
        marketplace,
        externalShopId,
        shopCipher: tokenData.shopCipher,
        status: 'connected',
        auth: {
          accessTokenEnc: tokenData.access_token || tokenData.accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: marketplaceManager.tokenExpiry(tokenData.expires_in),
        },
        lastSyncAt: new Date(),
      },
      { upsert: true, returnDocument: 'after' },
    )

    // First load of orders and listings, and which sections the new login can reach.
    for (const kind of ['full', 'access']) {
      syncQueue.enqueue(kind, shop._id).catch((err) => console.warn(`Initial ${kind} sync failed for ${shop.name}:`, err.message))
    }

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
    const attributes = await cache.wrap(`taxonomy:${shop._id}:attributes:${req.params.categoryId}`, 24 * 3600, async () => (await marketplaceManager.getCategoryAttributes(shop, req.params.categoryId)) || [])
    res.json(attributes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/finances — Settlement and fee breakdown
router.get('/:id/finances', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    const finances = await marketplaceManager.getFinances(shop)
    res.json(finances || {})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/sync-all — Synchronizes orders, customers, and product listings from all shops
router.post('/sync-all', requireRole('super_admin'), async (req, res) => {
  try {
    const shops = await Shop.find({ status: 'connected' }).select('_id')
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
    const result = await syncQueue.enqueue('full', shop._id, { wait: true })
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

