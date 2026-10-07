const bcrypt = require('bcryptjs')
const express = require('express')
const { requireAuth, requireRole, signToken } = require('../middleware/auth')
const User = require('../models/User')

const router = express.Router()

// POST /api/auth/register — first-ever user can be a super_admin (bootstrap);
// afterwards only a super_admin can create users.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, shopId } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role required' })
    }
    const count = await User.countDocuments()
    if (count > 0) {
      return res.status(403).json({ error: 'Registration is disabled — ask a super_admin' })
    }
    if (role !== 'super_admin') {
      return res.status(400).json({ error: 'First user must be super_admin' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, passwordHash, role, shopId: shopId || null })
    res.status(201).json({ token: signToken(user), user: { id: user._id, role: user.role } })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash')
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    user.lastLoginAt = new Date()
    await user.save()
    res.json({
      token: signToken(user),
      user: { id: user._id, name: user.name, role: user.role, shopId: user.shopId },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/users — super_admin creates sub_admins (or more admins)
router.post('/users', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, password, role, shopId } = req.body
    if (role === 'sub_admin' && !shopId) {
      return res.status(400).json({ error: 'sub_admin requires shopId' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      shopId: shopId || null,
      createdBy: req.user.id,
    })
    res.status(201).json({ id: user._id, email: user.email, role: user.role })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
