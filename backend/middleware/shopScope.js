/**
 * Per-shop API (/api/<urlId>/...): every request is pinned to one marketplace. The shop comes
 * from the URL, never from the client.
 */
const { KEYS } = require('../marketplaces')

/**
 * Sets `marketplace` in the query and body to the shop's key (whatever the client sent) and
 * narrows a sub-admin's shops to this marketplace. Put it after `loadAccess`.
 */
function onlyShop(key) {
  if (!KEYS.includes(key)) throw new Error(`Unknown marketplace ${key}`)
  return (req, res, next) => {
    req.shopKey = key
    // Express 5 parses req.query on every read; an own property replaces it for this request.
    Object.defineProperty(req, 'query', { value: { ...req.query, marketplace: key }, writable: true, configurable: true, enumerable: true })
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body.marketplace = key
    if (req.user?.role === 'sub_admin' && Array.isArray(req.allowedShopIds)) {
      req.allowedShopIds = req.allowedShopIds.filter((id) => req.shopMarkets?.get(String(id)) === key)
    }
    next()
  }
}

/**
 * `router.param` handler: a record id in the URL must belong to this shop (another shop's order,
 * conversation or shop id answers 404, as if it didn't exist here).
 */
function belongsToShop(loadModel, key, label) {
  return async (req, res, next, id) => {
    try {
      const Model = loadModel()
      const field = Model.schema.path('marketplace') ? 'marketplace' : null
      if (!field) return next()
      const found = await Model.exists({ _id: id, marketplace: key }).catch(() => null)
      if (!found) return res.status(404).json({ error: `${label} not found` })
      next()
    } catch (err) {
      next(err)
    }
  }
}

module.exports = { onlyShop, belongsToShop }
