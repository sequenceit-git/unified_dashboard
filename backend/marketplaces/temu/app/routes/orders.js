const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../../../middleware/auth')

const service = require('../services/orders')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const { onlyShop, belongsToShop } = require('../../../../middleware/shopScope')

/** /api/<shop>/orders for one shop (its key is fixed by the URL). */
function ordersRoutes(shopKey) {
  const router = express.Router()
  router.param('id', belongsToShop(() => require('../../../../models/Order'), shopKey, 'Order'))
  router.use(requireAuth, loadAccess, onlyShop(shopKey), requireMainRoute('orders'), limitToSection('orders'))

  // GET /api/<shop>/orders?marketplace=&shopId=&status=&q=&from=&to=&sort=&page=&limit=
  router.get('/', async (req, res) => {
    try {
      res.json(await service.list(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/orders/:id/temu-detail — Temu's full order detail (items, amounts, timeline)
  router.get('/:id/temu-detail', async (req, res) => {
    try {
      res.json(await service.temuDetail(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // POST /api/<shop>/orders/:id/full-address — the buyer's full address, on request only; never stored
  router.post('/:id/full-address', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      res.json(await service.fullAddress(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // Temu buy-shipping (services/labels.js): services, buy, retry, own carrier, pickups; the label file itself.
  const labels = require('../services/labels')
  for (const [method, path, fn] of [['get', '/:id/label-services', 'services'], ['post', '/:id/buy-label', 'buy'], ['get', '/:id/label-result', 'check'], ['post', '/:id/label-retry', 'retry'], ['post', '/:id/own-carrier', 'ownCarrier'], ['post', '/:id/pickup', 'pickup'], ['get', '/:id/pickup', 'pickupStatus'], ['post', '/:id/pickup-cancel', 'cancelPickup']]) {
    router[method](path, async (req, res) => {
      try {
        res.json(await labels[fn](ctxOf(req)))
      } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json(err.body)
        res.status(502).json({ error: err.message })
      }
    })
  }
  router.get('/:id/label', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      const file = await labels.labelFile(ctxOf(req))
      res.set('Content-Type', file.contentType)
      res.set('Content-Disposition', `inline; filename="${file.name}"`)
      res.send(file.buffer)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // Temu order follow-up (services/orders.js): ship-together groups, after-sale details, verification.
  for (const [method, path, fn] of [['get', '/temu-ship-together', 'shipTogether'], ['get', '/:id/temu-follow-up', 'temuFollowUp'], ['post', '/:id/verification', 'uploadVerification']]) {
    router[method](path, async (req, res) => {
      try {
        res.json(await service[fn](ctxOf(req)))
      } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json(err.body)
        res.status(502).json({ error: err.message })
      }
    })
  }

  // GET /api/<shop>/orders/:id
  // GET /api/<shop>/orders/counts — orders per Temu state and the late ones (status pills, needs attention)
  router.get('/counts', async (req, res) => {
    try {
      res.json(await service.counts(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/:id', async (req, res) => {
    try {
      res.json(await service.get(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/orders/sync — pull orders from connected marketplace shops
  router.post('/sync', async (req, res) => {
    try {
      res.json(await service.sync(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/orders/:id/status — { status }
  router.patch('/:id/status', async (req, res) => {
    try {
      res.json(await service.updateStatus(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/orders/:id/shipping — { carrier, trackingNumber }
  router.patch('/:id/shipping', async (req, res) => {
    try {
      res.json(await service.updateShipping(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/orders/:id/returns — { reason, refundAmount? }
  router.post('/:id/returns', async (req, res) => {
    try {
      res.status(201).json(await service.addReturn(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/orders/:id/returns/:index — { status: 'approved' | 'rejected' | 'received' }
  router.patch('/:id/returns/:index', async (req, res) => {
    try {
      res.json(await service.updateReturn(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/orders/:id/cancel — cancel order on connected marketplace and mark locally cancelled
  router.post('/:id/cancel', async (req, res) => {
    try {
      res.json(await service.cancel(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/orders/:id/refund — process full or partial refund on marketplace
  router.post('/:id/refund', async (req, res) => {
    try {
      res.json(await service.refund(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })
  return router
}

module.exports = ordersRoutes
