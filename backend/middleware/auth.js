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
      // The role in the database wins over the one in the token (a demoted admin keeps an old token).
      req.user.role = cached.user.role
      req.allowedShopIds = cached.allowedShopIds
      req.shopMarkets = cached.shopMarkets
      return next()
    }

    const user = await User.findById(req.user.id).select('name email role mainRoutes allowedSections marketplaces status shopId isDeleted').lean()
    if (!user || user.isDeleted) {
      accessCache.delete(req.user.id)
      return res.status(401).json({ error: 'This account has been deleted. Contact your administrator.' })
    }
    if (user.status !== 'active') {
      accessCache.delete(req.user.id)
      return res.status(401).json({ error: 'User is inactive or no longer exists' })
    }
    req.authUser = user
    req.user.role = user.role
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
    // Marketplace of each allowed shop, so a section limit like `ebay:orders` can be applied per shop.
    const shopMarkets = new Map()
    if (allowedShopIds?.length) {
      const shops = await Shop.find({ _id: { $in: allowedShopIds } }).select('marketplace').lean()
      for (const shop of shops) shopMarkets.set(String(shop._id), shop.marketplace)
    }
    req.shopMarkets = shopMarkets

    if (accessCache.size > MAX_ACCESS_CACHE) {
      const oldestKey = accessCache.keys().next().value
      accessCache.delete(oldestKey)
    }
    accessCache.set(req.user.id, { user, allowedShopIds, shopMarkets, timestamp: Date.now() })
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

/** True when the user may reach one shop-specific section (e.g. `returns` on eBay). Mirrors the frontend gate. */
function canUseSection(user, marketplace, sectionId, route) {
  if (!user) return false
  if (user.role === 'super_admin') return true
  if (route && !user.mainRoutes?.includes(route)) return false
  const list = user.allowedSections
  if (!Array.isArray(list) || list.length === 0) return true
  return list.includes(sectionId) || list.includes(`${marketplace}:${sectionId}`)
}

/**
 * Narrows a sub-admin's shops to those where they may use `sectionId` (their `allowedSections`
 * can grant e.g. `ebay:orders` but not `tiktok_shop:orders`). Everything downstream that reads
 * `req.allowedShopIds` or uses `shopFilter` then only sees those shops. Put it after `loadAccess`.
 */
function limitToSection(sectionId) {
  return (req, res, next) => {
    const user = req.authUser || req.user
    if (user.role !== 'sub_admin' || !Array.isArray(req.allowedShopIds)) return next()
    req.allowedShopIds = req.allowedShopIds.filter((id) =>
      canUseSection(user, req.shopMarkets?.get(String(id)), sectionId))
    next()
  }
}

/** True when the user may act on this shop (super admins: any shop). */
function canAccessShop(req, shopId) {
  if ((req.authUser || req.user).role !== 'sub_admin') return true
  return (req.allowedShopIds || []).some((id) => String(id) === String(shopId))
}

/** Short-lived signed `state` for OAuth connect, bound to the super admin who started it. */
function signOAuthState(userId, marketplace) {
  return jwt.sign({ u: String(userId), m: marketplace, p: 'oauth' }, process.env.JWT_SECRET, { expiresIn: '15m' })
}

function verifyOAuthState(state, marketplace, userId) {
  try {
    const payload = jwt.verify(String(state || ''), process.env.JWT_SECRET)
    return payload.p === 'oauth' && payload.m === marketplace && (!userId || payload.u === String(userId))
  } catch {
    return false
  }
}

module.exports = {
  signToken, requireAuth, loadAccess, requireRole, requireMainRoute, shopFilter, clearUserAccessCache,
  canUseSection, canAccessShop, limitToSection, signOAuthState, verifyOAuthState,
}
