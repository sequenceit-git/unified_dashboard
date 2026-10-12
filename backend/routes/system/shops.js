const express = require('express')
const { requireAuth, loadAccess, requireRole } = require('../../middleware/auth')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')

const router = express.Router()

// GET /api/shops/oauth/callback/:marketplace — Browser redirect callback from eBay / TikTok / Temu OAuth
router.get('/oauth/callback/:marketplace', async (req, res) => {
  try {
    const { marketplace } = req.params
    const code = req.query.code
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()

    if (!code) {
      return res.redirect(`${clientUrl}/?error=no_code`)
    }

    const tokenData = await marketplaceManager.exchangeCode(marketplace, code)

    await Shop.findOneAndUpdate(
      { marketplace },
      {
        name: `${marketplace.toUpperCase()} Store`,
        marketplace,
        status: 'connected',
        auth: {
          accessTokenEnc: tokenData.access_token || tokenData.accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        },
        lastSyncAt: new Date(),
      },
      { upsert: true, new: true },
    )

    res.redirect(`${clientUrl}/?connected=${marketplace}`)
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()
    res.redirect(`${clientUrl}/?error=${encodeURIComponent(err.message)}`)
  }
})

router.use(requireAuth, loadAccess)

// GET /api/shops — id/name/marketplace for dropdowns and tabs.
// Sub-admins only see their own shop.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'sub_admin' ? { _id: { $in: req.allowedShopIds } } : {}
    const shops = await Shop.find(filter).select('name marketplace status externalShopId lastSyncAt').sort({ marketplace: 1 })
    res.json(shops)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/configs — Check configuration status for all 3 marketplaces
router.get('/configs', requireRole('super_admin'), (req, res) => {
  res.json({
    ebay: {
      configured: Boolean(config.ebay.clientId && config.ebay.clientSecret),
      environment: config.ebay.environment,
      ruNameConfigured: Boolean(config.ebay.ruName),
    },
    tiktok_shop: {
      configured: Boolean(config.tiktok_shop.appKey && config.tiktok_shop.appSecret),
      region: config.tiktok_shop.region,
    },
    temu: {
      configured: Boolean(config.temu.appKey && config.temu.appSecret),
      region: config.temu.region,
    },
  })
})

// GET /api/shops/oauth/connect/:marketplace — Generate OAuth connect URL
router.get('/oauth/connect/:marketplace', requireRole('super_admin'), (req, res) => {
  try {
    const { marketplace } = req.params
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
    const { marketplace } = req.params
    const { code, shopName, externalShopId } = req.body
    if (!code) return res.status(400).json({ error: 'Authorization code is required' })

    const tokenData = await marketplaceManager.exchangeCode(marketplace, code)

    const shop = await Shop.findOneAndUpdate(
      { marketplace, externalShopId: externalShopId || `${marketplace}-${Date.now()}` },
      {
        name: shopName || `${marketplace.toUpperCase()} Store`,
        marketplace,
        status: 'connected',
        auth: {
          accessTokenEnc: tokenData.access_token || tokenData.accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        },
        lastSyncAt: new Date(),
      },
      { upsert: true, new: true },
    )

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
    const categories = await marketplaceManager.getCategories(shop, req.query.q)
    res.json(categories || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories/:categoryId/attributes — Category attribute schema
router.get('/:id/categories/:categoryId/attributes', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    const attributes = await marketplaceManager.getCategoryAttributes(shop, req.params.categoryId)
    res.json(attributes || [])
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
    const results = await marketplaceManager.syncAllShops()
    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/:id/sync — Synchronize specific shop
router.post('/:id/sync', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).select('+auth.accessTokenEnc')
    if (!shop) return res.status(404).json({ error: 'Shop not found' })
    const result = await marketplaceManager.syncAllForShop(shop)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

