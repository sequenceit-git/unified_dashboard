const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../middleware/auth')
const { cachedResponse } = require('../../services/core/cache')

const service = require('../../services/analytics/reports')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('analytics'), limitToSection('analytics'), cachedResponse('analytics', 120))

// GET /api/analytics/summary?from=&to=
router.get('/summary', async (req, res) => {
  try {
    res.json(await service.summary(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/revenue?from=&to=&marketplace=
router.get('/revenue', async (req, res) => {
  try {
    res.json(await service.revenue(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/marketplaces?from=&to=
router.get('/marketplaces', async (req, res) => {
  try {
    res.json(await service.marketplaces(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/products?from=&to=&limit=
router.get('/products', async (req, res) => {
  try {
    res.json(await service.products(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/inventory — low/out-of-stock snapshot
router.get('/inventory', async (req, res) => {
  try {
    res.json(await service.inventory(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
