const express = require('express')
const { requireAuth, loadAccess, requireRole, signOAuthState, verifyOAuthState } = require('../../middleware/auth')
const marketplaceManager = require('../../services/marketplace')
const config = require('../../config/marketplaces')
const registry = require('../../marketplaces')
const { canonical: canonicalMarketplace } = registry

const service = require('../../services/system/shops')
const { HttpError, ctxOf } = require('../../utils/httpError')

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

// GET /api/shops/configs — whether each shop's API keys are set (from its adapter)
router.get('/configs', requireRole('super_admin'), (req, res) => {
  res.json(Object.fromEntries(registry.all().map((adapter) => [adapter.key, adapter.configStatus?.(config[adapter.key] || {}) || { configured: false }])))
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

