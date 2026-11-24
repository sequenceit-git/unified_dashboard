const express = require('express')
const { requireAuth, loadAccess } = require('../../../../middleware/auth')
const { onlyShop, belongsToShop } = require('../../../../middleware/shopScope')
const service = require('../services/sections')
const { HttpError, ctxOf } = require('../../../../utils/httpError')

/** /api/<shop>/shops/:id/…: one connected shop's catalog lookups and finances. */
function shopToolsRoutes(shopKey) {
  const router = express.Router()
  router.param('id', belongsToShop(() => require('../../../../models/Shop'), shopKey, 'Shop'))
  router.use(requireAuth, loadAccess, onlyShop(shopKey))

  // GET /api/<shop>/shops/:id/categories — Fetch marketplace taxonomy categories
  router.get('/:id/categories', async (req, res) => {
    try {
      res.json(await service.categories(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/shops/:id/categories/:categoryId/attributes — Category attribute schema
  router.get('/:id/categories/:categoryId/attributes', async (req, res) => {
    try {
      res.json(await service.attributes(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/shops/:id/categories/:categoryId/rules — certifications & category rules
  router.get('/:id/categories/:categoryId/rules', async (req, res) => {
    try {
      res.json(await service.categoryRules(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/shops/:id/brands — Search available brands for a shop / category
  router.get('/:id/brands', async (req, res) => {
    try {
      res.json(await service.brands(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/shops/:id/size-charts — Search TikTok Shop size chart templates
  router.get('/:id/size-charts', async (req, res) => {
    try {
      res.json(await service.sizeCharts(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/<shop>/shops/:id/finances — Settlement and fee breakdown
  router.get('/:id/finances', async (req, res) => {
    try {
      res.json(await service.finances(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(500).json({ error: err.message })
    }
  })
  return router
}

module.exports = shopToolsRoutes
