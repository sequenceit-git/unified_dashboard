const jwt = require('jsonwebtoken')
const User = require('../models/User')
const UserShopAccess = require('../models/UserShopAccess')

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, shopId: user.shopId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  )
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.authUser || req.user
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

async function loadAccess(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('role mainRoutes status shopId isDeleted')
    if (!user || user.isDeleted) {
      return res.status(401).json({ error: 'This account has been deleted. Contact your administrator.' })
    }
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'User is inactive or no longer exists' })
    }
    req.authUser = user
    if (user.role === 'super_admin') {
      req.allowedShopIds = null
    } else {
      const access = await UserShopAccess.find({ userId: user._id }).select('shopId')
      // Keep existing dev data working until it is migrated to user_shop_access.
      req.allowedShopIds = access.length ? access.map((row) => row.shopId) : user.shopId ? [user.shopId] : []
    }
    next()
  } catch (err) {
    next(err)
  }
}

function requireMainRoute(routeName) {
  return (req, res, next) => {
    const user = req.authUser || req.user
    if (user.role === 'super_admin' || user.mainRoutes?.includes(routeName)) return next()
    return res.status(403).json({ error: `You do not have access to the ${routeName} section` })
  }
}

function shopFilter(req, model) {
  if ((req.authUser || req.user).role !== 'sub_admin') return {}
  if (!model.schema.path('shopId')) return {}
  return { shopId: { $in: req.allowedShopIds || [] } }
}

module.exports = { signToken, requireAuth, loadAccess, requireRole, requireMainRoute, shopFilter }
