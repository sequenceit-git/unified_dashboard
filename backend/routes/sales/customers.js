const express = require('express')
const { requireAuth, loadAccess, requireMainRoute, limitToSection } = require('../../middleware/auth')

const service = require('../../services/sales/customers')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('customers'), limitToSection('customers'))

// GET /api/customers?q=&sort=&page=&limit=
router.get('/', async (req, res) => {
  try {
    res.json(await service.list(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/customers/:id — profile + order history + conversations
router.get('/:id', async (req, res) => {
  try {
    res.json(await service.get(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/customers/:id
router.patch('/:id', async (req, res) => {
  try {
    res.json(await service.update(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
