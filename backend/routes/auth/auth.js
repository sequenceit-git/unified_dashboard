const express = require('express')
const { requireAuth, loadAccess, requireRole } = require('../../middleware/auth')


const service = require('../../services/auth/users')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()

// POST /api/auth/register — first-ever user can be a super_admin (bootstrap);
// afterwards only a super_admin can create users.
router.post('/register', async (req, res) => {
  try {
    res.status(201).json(await service.register(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    res.json(await service.login(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/users — super_admin creates sub_admins (or more admins)
router.use(requireAuth, loadAccess)

// GET /api/auth/me — current authenticated user with up-to-date permissions and shops
router.get('/me', async (req, res) => {
  try {
    res.json(await service.me(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/users — super_admin creates sub_admins and their access
router.post('/users', requireRole('super_admin'), async (req, res) => {
  try {
    res.status(201).json(await service.createUser(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

router.get('/users', requireRole('super_admin'), async (req, res) => {
  res.json(await service.listUsers(ctxOf(req)))
})

router.patch('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await service.updateUser(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/auth/users/:id — super_admin permanently deletes a sub-admin.
// Clears cached access, removes all shop permissions, and deletes the user document.
router.delete('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    res.json(await service.deleteUser(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
