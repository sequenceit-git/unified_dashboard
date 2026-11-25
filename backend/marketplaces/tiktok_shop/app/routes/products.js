const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../../../middleware/auth')

const service = require('../services/products')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const { onlyShop, belongsToShop } = require('../../../../middleware/shopScope')

/** /api/<shop>/products for one shop (its key is fixed by the URL). */
function productsRoutes(shopKey) {
  const router = express.Router()

  router.param('id', belongsToShop(() => require('../../../../models/Product'), shopKey, 'Product'))
  router.use(requireAuth, loadAccess, onlyShop(shopKey), requireMainRoute('products'), limitToSection('products'))

  // GET /api/<shop>/products?q=&status=&category=&stock=low|out&shop=&sort=&page=&limit=
  router.get('/', async (req, res) => {
    try {
      res.json(await service.list(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/<shop>/products/import-url — { url } → editable draft read from a product page
  router.post('/import-url', async (req, res) => {
    try {
      res.json(await service.importFromUrl(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(422).json({ error: err.message })
    }
  })

  // POST /api/<shop>/products/fill-attributes — map known facts onto a shop category schema
  router.post('/fill-attributes', async (req, res) => {
    try {
      res.json(await service.fillAttributes(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(422).json({ error: err.message })
    }
  })

  // GET /api/<shop>/products/counts — products per TikTok listing state (Products status pills)
  router.get('/counts', async (req, res) => {
    try {
      res.json(await service.counts(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/products/categories
  router.get('/categories', async (req, res) => {
    try {
      res.json(await service.categories(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/products/seo-words?productIds= — TikTok's suggested search keywords
  router.get('/seo-words', async (req, res) => {
    try {
      res.json(await service.seoWords(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // GET /api/<shop>/products/:id
  router.get('/:id', async (req, res) => {
    try {
      res.json(await service.get(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/products
  router.post('/', async (req, res) => {
    try {
      res.status(201).json(await service.create(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/products/:id
  router.patch('/:id', async (req, res) => {
    try {
      res.json(await service.update(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // DELETE /api/<shop>/products/:id — remove the product and its shop listings.
  // TikTok Delete leaves the product in search as DELETED, so the id is remembered and is not imported again.
  router.delete('/:id', async (req, res) => {
    try {
      res.json(await service.remove(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/products/:id/list — list a product on a shop { shopId, price?, title?, categoryId?, condition?, weight?, dimensions?, images?, aspects? }
  // POST /api/<shop>/products/:id/listing-check — TikTok's verdict on a listing before publishing it
  router.post('/:id/listing-check', async (req, res) => {
    try {
      res.json(await service.listingCheck(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/:id/list', async (req, res) => {
    try {
      res.status(201).json(await service.listOnShop(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/products/:id/listing-action — { action: end|relist|unpublish|publish|delete }
  router.post('/:id/listing-action', async (req, res) => {
    try {
      res.json(await service.listingAction(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(422).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/products/:id/sync — push local price/stock to its listings
  router.patch('/:id/sync', async (req, res) => {
    try {
      res.json(await service.sync(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // PATCH /api/<shop>/products/:id/price — update price and push to connected shops
  router.patch('/:id/price', async (req, res) => {
    try {
      res.json(await service.updatePrice(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })
  return router
}

module.exports = productsRoutes

