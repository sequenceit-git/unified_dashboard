const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../middleware/auth')

const service = require('../../services/catalog/inventory')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('inventory'), limitToSection('inventory'))

// GET /api/inventory/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    res.json(await service.lowStock(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/inventory/logs?productId=&shopId=&reason=&direction=&q=&from=&to=&page=&limit=
router.get('/logs', async (req, res) => {
  try {
    res.json(await service.logs(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/inventory/adjust — { productId, variantSku?, change?, newStock?, reason, shopId? }
router.post('/adjust', async (req, res) => {
  try {
    res.status(201).json(await service.adjust(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/inventory/sync — push all live product inventory levels to connected marketplace listings
router.post('/sync', async (req, res) => {
  try {
    res.json(await service.sync(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

