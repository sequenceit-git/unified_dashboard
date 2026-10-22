const jwt = require('jsonwebtoken')
const User = require('../models/User')
const UserShopAccess = require('../models/UserShopAccess')
const Shop = require('../models/Shop')

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

const accessCache = new Map()
const ACCESS_CACHE_TTL = 30000 // 30 seconds
const MAX_ACCESS_CACHE = 500

function clearUserAccessCache(userId) {
  if (userId) accessCache.delete(String(userId))
  else accessCache.clear()
}

async function loadAccess(req, res, next) {
  try {
    const cached = accessCache.get(req.user.id)
    if (cached && Date.now() - cached.timestamp < ACCESS_CACHE_TTL) {
      req.authUser = cached.user
      req.allowedShopIds = cached.allowedShopIds
      return next()
    }

    const user = await User.findById(req.user.id).select('name email role mainRoutes marketplaces status shopId isDeleted').lean()
    if (!user || user.isDeleted) {
      accessCache.delete(req.user.id)
      return res.status(401).json({ error: 'This account has been deleted. Contact your administrator.' })
    }
    if (user.status !== 'active') {
      accessCache.delete(req.user.id)
      return res.status(401).json({ error: 'User is inactive or no longer exists' })
    }
    req.authUser = user
    let allowedShopIds = null
    if (user.role === 'super_admin') {
      allowedShopIds = null
    } else {
      const markets = Array.isArray(user.marketplaces) ? user.marketplaces : []
      const [access, marketShops] = await Promise.all([
        UserShopAccess.find({ userId: user._id }).select('shopId').lean(),
        markets.length ? Shop.find({ marketplace: { $in: markets } }).select('_id').lean() : [],
      ])
      const ids = new Map()
      for (const row of access) ids.set(String(row.shopId), row.shopId)
      for (const shop of marketShops) ids.set(String(shop._id), shop._id)
      if (!ids.size && user.shopId) ids.set(String(user.shopId), user.shopId)
      allowedShopIds = [...ids.values()]
    }
    req.allowedShopIds = allowedShopIds

    if (accessCache.size > MAX_ACCESS_CACHE) {
      const oldestKey = accessCache.keys().next().value
      accessCache.delete(oldestKey)
    }
    accessCache.set(req.user.id, { user, allowedShopIds, timestamp: Date.now() })
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

module.exports = { signToken, requireAuth, loadAccess, requireRole, requireMainRoute, shopFilter, clearUserAccessCache }
