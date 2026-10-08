const bcrypt = require('bcryptjs')
const express = require('express')
const { requireAuth, loadAccess, requireRole, signToken } = require('../../middleware/auth')
const UserShopAccess = require('../../models/UserShopAccess')
const Shop = require('../../models/Shop')
const { MAIN_ROUTES } = require('../../config/access')
const User = require('../../models/User')

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
    if (user && user.isDeleted) {
      return res.status(403).json({ error: 'This account has been deleted. Contact your administrator.' })
    }
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    user.lastLoginAt = new Date()
    await user.save()
    res.json({
      token: signToken(user),
      user: await userSummary(user),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/users — super_admin creates sub_admins (or more admins)
router.use(requireAuth, loadAccess)

async function userSummary(user) {
  const access = user.role === 'sub_admin'
    ? await UserShopAccess.find({ userId: user._id }).populate('shopId', 'name marketplace status')
    : []
  const shops = access.length
    ? access.map((row) => row.shopId).filter(Boolean)
    : user.shopId
      ? await Shop.find({ _id: user.shopId }).select('name marketplace status')
      : []
  return {
    id: user._id,
    name: user.name,
    role: user.role,
    profileImageUrl: user.profileImageUrl || '',
    mainRoutes: user.mainRoutes,
    shopId: user.shopId,
    shops,
  }
}

// POST /api/auth/users — super_admin creates sub_admins and their access
router.post('/users', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, password, role, shopIds = [], shopId, mainRoutes = [], profileImageUrl = '' } = req.body
    const requestedShopIds = Array.isArray(shopIds) && shopIds.length
      ? shopIds
      : shopId
        ? [shopId]
        : []
    if (!name || !email || !password || !role || !['super_admin', 'sub_admin'].includes(role)) {
      return res.status(400).json({ error: 'name, email, password, and a valid role are required' })
    }
    if (role === 'sub_admin' && (!Array.isArray(requestedShopIds) || requestedShopIds.length === 0)) {
      return res.status(400).json({ error: 'sub_admin requires at least one shopId' })
    }
    if (!Array.isArray(mainRoutes) || mainRoutes.some((route) => !MAIN_ROUTES.includes(route))) {
      return res.status(400).json({ error: 'mainRoutes contains an unknown route' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email,
      passwordHash,
      profileImageUrl,
      role,
      mainRoutes: role === 'super_admin' ? MAIN_ROUTES : mainRoutes,
      // Keep the legacy field populated during the migration period.
      shopId: role === 'sub_admin' ? requestedShopIds[0] : null,
      createdBy: req.user.id,
    })
    if (role === 'sub_admin') {
      const uniqueShopIds = [...new Set(requestedShopIds.map(String))]
      const validShops = await Shop.countDocuments({ _id: { $in: uniqueShopIds } })
      if (validShops !== uniqueShopIds.length) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({ error: 'One or more shopIds are invalid' })
      }
      await UserShopAccess.insertMany(
        uniqueShopIds.map((shopId) => ({
          userId: user._id, shopId, grantedBy: req.user.id,
        })),
      )
    }
    res.status(201).json({ id: user._id, email: user.email, role: user.role })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/users', requireRole('super_admin'), async (req, res) => {
  const users = await User.find({ role: 'sub_admin', isDeleted: { $ne: true } }).select('-passwordHash').sort({ createdAt: -1 })
  const access = await UserShopAccess.find({ userId: { $in: users.map((user) => user._id) } })
  const byUser = new Map()
  for (const row of access) {
    if (!byUser.has(String(row.userId))) byUser.set(String(row.userId), [])
    byUser.get(String(row.userId)).push(row.shopId)
  }
  res.json(users.map((user) => ({ ...user.toObject(), shopIds: byUser.get(String(user._id)) || [] })))
})

router.patch('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, password, profileImageUrl, mainRoutes, shopIds, status } = req.body
    if (mainRoutes && (!Array.isArray(mainRoutes) || mainRoutes.some((route) => !MAIN_ROUTES.includes(route)))) {
      return res.status(400).json({ error: 'mainRoutes contains an unknown route' })
    }
    const user = await User.findOne({ _id: req.params.id, role: 'sub_admin', isDeleted: { $ne: true } })
    if (!user) return res.status(404).json({ error: 'Sub-admin not found' })
    if (name !== undefined) user.name = name
    if (email !== undefined) user.email = email
    if (profileImageUrl !== undefined) user.profileImageUrl = profileImageUrl
    if (password) user.passwordHash = await bcrypt.hash(password, 10)
    if (mainRoutes) user.mainRoutes = mainRoutes
    if (status) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'status must be active or disabled' })
      }
      user.status = status
    }
    if (shopIds) {
      if (!Array.isArray(shopIds) || shopIds.length === 0) {
        return res.status(400).json({ error: 'At least one shopId is required' })
      }
      const uniqueShopIds = [...new Set(shopIds.map(String))]
      const validShops = await Shop.countDocuments({ _id: { $in: uniqueShopIds } })
      if (validShops !== uniqueShopIds.length) return res.status(400).json({ error: 'One or more shopIds are invalid' })
      await UserShopAccess.deleteMany({ userId: user._id })
      await UserShopAccess.insertMany(uniqueShopIds.map((shopId) => ({
        userId: user._id, shopId, grantedBy: req.user.id,
      })))
      user.shopId = uniqueShopIds[0]
    }
    await user.save()
    res.json(await userSummary(user))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/auth/users/:id — super_admin soft-deletes (partial delete) a sub-admin.
// The row is kept for audit history: isDeleted=true, status=disabled,
// shop access revoked. Deleted accounts are hidden from GET /users and
// blocked at login + loadAccess even with a previously issued token.
router.delete('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'sub_admin', isDeleted: { $ne: true } })
    if (!user) return res.status(404).json({ error: 'Sub-admin not found' })
    user.isDeleted = true
    user.deletedAt = new Date()
    user.deletedBy = req.user.id
    user.status = 'disabled'
    await user.save()
    await UserShopAccess.deleteMany({ userId: user._id })
    res.json({ deleted: true, id: user._id })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
