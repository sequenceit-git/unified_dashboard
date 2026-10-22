const bcrypt = require('bcryptjs')
const express = require('express')
const { requireAuth, loadAccess, requireRole, signToken, clearUserAccessCache } = require('../../middleware/auth')
const UserShopAccess = require('../../models/UserShopAccess')
const Shop = require('../../models/Shop')
const { MAIN_ROUTES } = require('../../config/access')
const User = require('../../models/User')
const { canonicalMarketplace } = require('../../utils/marketplace')

const SHOP_MARKETS = ['ebay', 'tiktok_shop', 'temu']
const STORED_ROUTES = new Set([...MAIN_ROUTES, 'discovery'])

function storedRoutes(routes) {
  return (routes || []).filter((route) => STORED_ROUTES.has(route))
}

function parseUsername(value) {
  const username = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
    return { error: 'Username must be 2–32 characters and use letters, numbers, dots, or hyphens' }
  }
  return { username }
}

async function usernameTaken(username, exceptId) {
  const query = { $or: [{ username }, { email: username }] }
  if (exceptId) query._id = { $ne: exceptId }
  return Boolean(await User.findOne(query).select('_id'))
}

function parseMarkets(values) {
  if (!Array.isArray(values)) return { error: 'marketplaces must be a list of shops' }
  const markets = []
  for (const value of values) {
    const market = canonicalMarketplace(value)
    if (!market || !SHOP_MARKETS.includes(market)) return { error: 'Unknown shop' }
    if (!markets.includes(market)) markets.push(market)
  }
  return { markets }
}

async function marketsFromShopIds(shopIds) {
  const shops = await Shop.find({ _id: { $in: shopIds } }).select('marketplace')
  return [...new Set(shops.map((shop) => shop.marketplace).filter((market) => SHOP_MARKETS.includes(market)))]
}

async function syncShopAccess(user, markets, grantedBy) {
  user.marketplaces = markets
  const shops = await Shop.find({ marketplace: { $in: markets } }).select('_id')
  await UserShopAccess.deleteMany({ userId: user._id })
  if (shops.length) {
    await UserShopAccess.insertMany(shops.map((shop) => ({
      userId: user._id,
      shopId: shop._id,
      grantedBy,
    })))
  }
  user.shopId = shops[0]?._id || null
  return shops
}

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
    const { email, username, password } = req.body
    const loginName = String(username || email || '').trim().toLowerCase()
    const user = await User.findOne({ $or: [{ email: loginName }, { username: loginName }] }).select('+passwordHash')
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
  const derived = [...new Set(shops.map((shop) => shop.marketplace).filter((market) => SHOP_MARKETS.includes(market)))]
  return {
    id: user._id,
    name: user.name,
    username: user.username || user.email,
    role: user.role,
    profileImageUrl: user.profileImageUrl || '',
    mainRoutes: user.mainRoutes,
    marketplaces: user.marketplaces?.length ? user.marketplaces : derived,
    shopId: user.shopId,
    shops,
  }
}

// POST /api/auth/users — super_admin creates sub_admins and their access
router.post('/users', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, username, password, role, shopIds = [], shopId, marketplaces, mainRoutes = [], profileImageUrl = '' } = req.body
    const requestedShopIds = Array.isArray(shopIds) && shopIds.length
      ? shopIds
      : shopId
        ? [shopId]
        : []
    const parsedName = parseUsername(username || email)
    if (!name || !password || !role || !['super_admin', 'sub_admin'].includes(role)) {
      return res.status(400).json({ error: 'name, username, password, and a valid role are required' })
    }
    if (parsedName.error) return res.status(400).json({ error: parsedName.error })
    if (await usernameTaken(parsedName.username)) {
      return res.status(400).json({ error: 'That username is already in use' })
    }
    if (!Array.isArray(mainRoutes) || mainRoutes.some((route) => !MAIN_ROUTES.includes(route))) {
      return res.status(400).json({ error: 'mainRoutes contains an unknown route' })
    }
    let markets = []
    const assigningShops = Array.isArray(marketplaces) || requestedShopIds.length > 0
    if (role === 'sub_admin' && assigningShops) {
      const parsed = Array.isArray(marketplaces)
        ? parseMarkets(marketplaces)
        : { markets: await marketsFromShopIds(requestedShopIds) }
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      markets = parsed.markets
      if (!markets.length) return res.status(400).json({ error: 'Select at least one shop' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      username: parsedName.username,
      email: parsedName.username,
      passwordHash,
      profileImageUrl,
      role,
      mainRoutes: role === 'super_admin' ? MAIN_ROUTES : mainRoutes,
      marketplaces: markets,
      shopId: null,
      createdBy: req.user.id,
    })
    if (role === 'sub_admin' && markets.length) await syncShopAccess(user, markets, req.user.id)
    await user.save()
    res.status(201).json({ id: user._id, username: user.username, role: user.role })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/users', requireRole('super_admin'), async (req, res) => {
  const users = await User.find({ role: 'sub_admin', isDeleted: { $ne: true } }).select('-passwordHash').sort({ createdAt: -1 })
  const access = await UserShopAccess.find({ userId: { $in: users.map((user) => user._id) } })
  const byUser = new Map()
  const shopIds = []
  for (const row of access) {
    if (!byUser.has(String(row.userId))) byUser.set(String(row.userId), [])
    byUser.get(String(row.userId)).push(row.shopId)
    shopIds.push(row.shopId)
  }
  const shopDocs = await Shop.find({ _id: { $in: shopIds } }).select('marketplace')
  const marketByShop = new Map(shopDocs.map((shop) => [String(shop._id), shop.marketplace]))
  res.json(users.map((user) => {
    const assignedShopIds = byUser.get(String(user._id)) || []
    const derived = [...new Set(assignedShopIds.map((id) => marketByShop.get(String(id))).filter((market) => SHOP_MARKETS.includes(market)))]
    return {
      ...user.toObject(),
      shopIds: assignedShopIds,
      mainRoutes: storedRoutes(user.mainRoutes),
      marketplaces: user.marketplaces?.length ? user.marketplaces : derived,
    }
  }))
})

router.patch('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, username, password, profileImageUrl, mainRoutes, shopIds, marketplaces, status } = req.body
    if (mainRoutes && (!Array.isArray(mainRoutes) || mainRoutes.some((route) => !MAIN_ROUTES.includes(route)))) {
      return res.status(400).json({ error: 'mainRoutes contains an unknown route' })
    }
    const user = await User.findOne({ _id: req.params.id, role: 'sub_admin', isDeleted: { $ne: true } })
    if (!user) return res.status(404).json({ error: 'Sub-admin not found' })
    if (name !== undefined) user.name = name
    if (username !== undefined || email !== undefined) {
      const parsedName = parseUsername(username || email)
      if (parsedName.error) return res.status(400).json({ error: parsedName.error })
      if (await usernameTaken(parsedName.username, user._id)) {
        return res.status(400).json({ error: 'That username is already in use' })
      }
      user.username = parsedName.username
      user.email = parsedName.username
    }
    if (profileImageUrl !== undefined) user.profileImageUrl = profileImageUrl
    if (password) user.passwordHash = await bcrypt.hash(password, 10)
    if (mainRoutes) user.mainRoutes = mainRoutes
    user.mainRoutes = storedRoutes(user.mainRoutes)
    if (status) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'status must be active or disabled' })
      }
      user.status = status
    }
    if (marketplaces !== undefined || shopIds) {
      const parsed = Array.isArray(marketplaces)
        ? parseMarkets(marketplaces)
        : { markets: await marketsFromShopIds(shopIds) }
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      if (!parsed.markets.length) return res.status(400).json({ error: 'Select at least one shop' })
      await syncShopAccess(user, parsed.markets, req.user.id)
    }
    await user.save()
    clearUserAccessCache(String(user._id))
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
    user.mainRoutes = storedRoutes(user.mainRoutes)
    user.isDeleted = true
    user.deletedAt = new Date()
    user.deletedBy = req.user.id
    user.status = 'disabled'
    await user.save()
    clearUserAccessCache(String(user._id))
    await UserShopAccess.deleteMany({ userId: user._id })
    res.json({ deleted: true, id: user._id })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
