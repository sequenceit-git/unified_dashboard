const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../../../middleware/auth')
const { cachedResponse } = require('../../../../services/core/cache')

const service = require('../services/analytics')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const { onlyShop } = require('../../../../middleware/shopScope')

/** /api/<shop>/analytics for one shop (its key is fixed by the URL). */
function analyticsRoutes(shopKey) {
  const router = express.Router()
  router.use(requireAuth, loadAccess, onlyShop(shopKey), requireMainRoute('analytics'), limitToSection('analytics'), cachedResponse('analytics', 120))

  // GET /api/<shop>/analytics/summary?from=&to=
  router.get('/summary', async (req, res) => {
    try {
      res.json(await service.summary(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/analytics/revenue?from=&to=&marketplace=
  // GET /api/<shop>/analytics/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD — eBay's traffic by day
  router.get('/traffic', async (req, res) => {
    try {
      res.json(await service.traffic(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/revenue', async (req, res) => {
    try {
      res.json(await service.revenue(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/analytics/marketplaces?from=&to=
  router.get('/marketplaces', async (req, res) => {
    try {
      res.json(await service.marketplaces(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/analytics/products?from=&to=&limit=
  router.get('/products', async (req, res) => {
    try {
      res.json(await service.products(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/analytics/inventory — low/out-of-stock snapshot
  router.get('/inventory', async (req, res) => {
    try {
      res.json(await service.inventory(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })
  return router
}

module.exports = analyticsRoutes
