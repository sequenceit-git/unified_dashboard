const express = require('express')
const { requireAuth, loadAccess, requireRole, canUseSection, signOAuthState, verifyOAuthState } = require('../../middleware/auth')
const Shop = require('../../models/Shop')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')
const registry = require('../../marketplaces')
const { canonical: canonicalMarketplace } = registry
const profiles = require('../../services/marketplace/profiles')

const service = require('../../services/system/shops')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()

/** Default shop for the package-label routes: the first one whose API can fetch shipping documents. */
const PACKAGE_SHOP = registry.all().find((a) => typeof a.service.getShippingDocument === 'function')?.key

/**
 * Guards a shop-section write: the user needs the section's main route and, when they have a
 * restricted `allowedSections` list, the section itself on that marketplace.
 */
function sectionGuard(sectionId, defaultMarketplace = registry.KEYS[0]) {
  return (req, res, next) => {
    const marketplace = canonicalMarketplace(req.body?.marketplace || req.query.marketplace || defaultMarketplace)
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === sectionId)
    if (!section || !canUseSection(req.authUser || req.user, marketplace, sectionId, section.route)) {
      return res.status(403).json({ error: `You do not have access to ${section?.label || sectionId} on this shop` })
    }
    next()
  }
}

async function findConnectedShop(req, res, marketplace) {
  const filter = { marketplace, status: 'connected' }
  if (req.user.role === 'sub_admin') filter._id = { $in: req.allowedShopIds || [] }
  const shop = await Shop.findOne(filter)
  if (shop) return shop
  if (req.user.role === 'sub_admin' && await Shop.exists({ marketplace, status: 'connected' })) {
    res.status(403).json({ error: 'You do not have permission for this shop' })
  } else {
    res.status(404).json({ error: `No connected ${marketplace} shop` })
  }
  return null
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
    await service.connectShop(market, code)

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
    res.json(await service.list(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/profiles?refresh=1 — each shop's sections, status names and product form,
// with the sections its API access allows. Sub-admins only get their marketplaces.
router.get('/profiles', async (req, res) => {
  try {
    res.json(await service.getProfiles(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/sections/:sectionId?marketplace=ebay — data for a shop-specific section.
router.get('/sections/:sectionId', async (req, res) => {
  try {
    res.json(await service.section(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(502).json({ error: err.message })
  }
})

// POST /api/shops/sections/offers/send — send discount offer to interested buyers on eBay
router.post('/sections/offers/send', sectionGuard('offers'), async (req, res) => {
  try {
    res.json(await service.sendOffer(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/returns/decide — approve or decline buyer return on eBay
router.post('/sections/returns/decide', sectionGuard('returns'), async (req, res) => {
  try {
    res.json(await service.decideReturn(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/cancellations/decide — approve or reject cancellation request on eBay/TikTok
router.post('/sections/cancellations/decide', sectionGuard('returns'), async (req, res) => {
  try {
    res.json(await service.decideCancellation(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/create — create promotional campaign on eBay/TikTok
router.post('/sections/promotions/create', sectionGuard('promotions'), async (req, res) => {
  try {
    res.json(await service.createPromotion(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/:id/pause — pause active promotion
router.post('/sections/promotions/:id/pause', sectionGuard('promotions'), async (req, res) => {
  try {
    res.json(await service.pausePromotion(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/shops/sections/promotions/:id/resume — resume paused promotion
router.post('/sections/promotions/:id/resume', sectionGuard('promotions'), async (req, res) => {
  try {
    res.json(await service.resumePromotion(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// GET /api/shops/sections/fulfillment/:packageId/label — fetch package shipping document from TikTok Shop
router.get('/sections/fulfillment/:packageId/label', sectionGuard('fulfillment', PACKAGE_SHOP), async (req, res) => {
  try {
    const marketplace = canonicalMarketplace(req.query.marketplace || PACKAGE_SHOP)
    const shop = await findConnectedShop(req, res, marketplace)
    if (!shop) return

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

// POST /api/shops/sections/fulfillment/:packageId/ship — ship a TikTok Shipping package (handover method)
router.post('/sections/fulfillment/:packageId/ship', sectionGuard('fulfillment', PACKAGE_SHOP), async (req, res) => {
  try {
    res.json(await service.shipPackage(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/shops/:id/ai-reply — { enabled } turns the inbox auto-reply on or off for a shop
router.patch('/:id/ai-reply', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await service.setAiReply(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
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
    res.json(await service.oauthCallback(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories — Fetch marketplace taxonomy categories
router.get('/:id/categories', async (req, res) => {
  try {
    res.json(await service.categories(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories/:categoryId/attributes — Category attribute schema
router.get('/:id/categories/:categoryId/attributes', async (req, res) => {
  try {
    res.json(await service.attributes(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/categories/:categoryId/rules — certifications & category rules
router.get('/:id/categories/:categoryId/rules', async (req, res) => {
  try {
    res.json(await service.categoryRules(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/brands — Search available brands for a shop / category
router.get('/:id/brands', async (req, res) => {
  try {
    res.json(await service.brands(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/size-charts — Search TikTok Shop size chart templates
router.get('/:id/size-charts', async (req, res) => {
  try {
    res.json(await service.sizeCharts(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shops/:id/finances — Settlement and fee breakdown
router.get('/:id/finances', async (req, res) => {
  try {
    res.json(await service.finances(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/sync-all — Synchronizes orders, customers, and product listings from all shops
router.post('/sync-all', async (req, res) => {
  try {
    res.json(await service.syncAll(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/:id/live-updates — (re)subscribe an eBay, TikTok Shop or Temu store to push webhooks
router.post('/:id/live-updates', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await service.liveUpdates(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/shops/:id/sync — Synchronize specific shop
router.post('/:id/sync', async (req, res) => {
  try {
    res.json(await service.sync(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

