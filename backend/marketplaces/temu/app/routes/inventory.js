const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../../../middleware/auth')

const service = require('../services/inventory')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const { onlyShop } = require('../../../../middleware/shopScope')

/** /api/<shop>/inventory for one shop (its key is fixed by the URL). */
function inventoryRoutes(shopKey) {
  const router = express.Router()
  router.use(requireAuth, loadAccess, onlyShop(shopKey), requireMainRoute('inventory'), limitToSection('inventory'))

  // GET /api/<shop>/inventory/low-stock
  router.get('/low-stock', async (req, res) => {
    try {
      res.json(await service.lowStock(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/inventory/temu-stock — Temu's stock per SKU next to the dashboard's
  router.get('/temu-stock', async (req, res) => {
    try {
      res.json(await service.temuStock(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // GET /api/<shop>/inventory/logs?productId=&shopId=&reason=&direction=&q=&from=&to=&page=&limit=
  router.get('/logs', async (req, res) => {
    try {
      res.json(await service.logs(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/<shop>/inventory/adjust — { productId, variantSku?, change?, newStock?, reason, shopId? }
  router.post('/adjust', async (req, res) => {
    try {
      res.status(201).json(await service.adjust(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/inventory/sync — push all live product inventory levels to connected marketplace listings
  router.post('/sync', async (req, res) => {
    try {
      res.json(await service.sync(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })
  return router
}

module.exports = inventoryRoutes

