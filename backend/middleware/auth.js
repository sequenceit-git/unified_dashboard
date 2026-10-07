const jwt = require('jsonwebtoken')

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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

// RBAC rule from db-schema: sub_admin sees only their own shop.
// Force shopId filter when the model is shop-scoped — never trust client input.
function shopFilter(req, model) {
  if (req.user.role !== 'sub_admin') return {}
  if (!model.schema.path('shopId')) return {}
  return { shopId: req.user.shopId }
}

module.exports = { signToken, requireAuth, requireRole, shopFilter }
