const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../../../middleware/auth')

const service = require('../services/products')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const { onlyShop, belongsToShop } = require('../../../../middleware/shopScope')

/** /api/<shop>/products for one shop (its key is fixed by the URL). */
function productsRoutes(shopKey) {
  const router = express.Router()

  router.param('id', belongsToShop(() => require('../../../../models/Product'), shopKey, 'Product'))
  router.use(requireAuth, loadAccess, onlyShop(shopKey), requireMainRoute('products'), limitToSection('goods'))

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

  // GET /api/<shop>/products/categories
  router.get('/categories', async (req, res) => {
    try {
      res.json(await service.categories(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // Temu compliance (app/services/compliance.js): goods with certificates, a goods' detail, certificate upload.
  const compliance = require('../services/compliance')
  for (const [method, path, fn] of [['get', '/compliance', 'list'], ['get', '/:goodsId/compliance', 'detail'], ['post', '/:goodsId/certificates', 'uploadCertificate']]) {
    router[method](path, async (req, res) => {
      try {
        res.json(await compliance[fn](ctxOf(req)))
      } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json(err.body)
        res.status(502).json({ error: err.message })
      }
    })
  }

  // Temu listing helpers (app/services/goodsHelpers.js): /api/<shop>/goods/helpers/*
  const goodsHelpers = require('../services/goodsHelpers')
  router.get('/helpers/categories/recommend', async (req, res) => {
    try {
      res.json(await goodsHelpers.recommend(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/categories', async (req, res) => {
    try {
      res.json(await goodsHelpers.categories(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/template', async (req, res) => {
    try {
      res.json(await goodsHelpers.template(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.post('/helpers/spec', async (req, res) => {
    try {
      res.json(await goodsHelpers.spec(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.post('/helpers/images', async (req, res) => {
    try {
      res.json(await goodsHelpers.uploadImages(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/shipping-templates', async (req, res) => {
    try {
      res.json(await goodsHelpers.shippingTemplates(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/brands', async (req, res) => {
    try {
      res.json(await goodsHelpers.brands(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/tax-codes', async (req, res) => {
    try {
      res.json(await goodsHelpers.taxCodes(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.get('/helpers/net-units', async (req, res) => {
    try {
      res.json(await goodsHelpers.netUnits(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  router.post('/helpers/check', async (req, res) => {
    try {
      res.json(await goodsHelpers.check(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // GET /api/<shop>/goods/:goodsId/temu-detail — the goods as Temu has it (details, SKUs, publication status)
  router.get('/:goodsId/temu-detail', async (req, res) => {
    try {
      res.json(await service.temuDetail(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // POST /api/<shop>/goods/:goodsId/sku-codes — set the seller's own SKU codes on Temu
  router.post('/:goodsId/sku-codes', async (req, res) => {
    try {
      res.json(await service.setSkuCodes(ctxOf(req)))
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

