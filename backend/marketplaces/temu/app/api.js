/**
 * Temu's dashboard API, mounted at /api/temu: the route groups Temu has. Temu has no inbox. Handlers and
 * services live in this folder (routes/, services/); the shop is fixed by the URL.
 */
const express = require('express')

const GROUPS = {
  goods: require('./routes/products'),
  inventory: require('./routes/inventory'),
  orders: require('./routes/orders'),
  customers: require('./routes/customers'),
  analytics: require('./routes/analytics'),
  sections: require('./routes/sections'),
  shops: require('./routes/shopTools'),
}

/** "METHOD /path" for each route of a router (Express keeps no mount paths). */
const routesOf = (router, prefix = '') => router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${layer.route.path}`))

const router = express.Router()
router.routeList = []
for (const [name, build] of Object.entries(GROUPS)) {
  const group = build('temu')
  router.use(`/${name}`, group)
  router.routeList.push(...routesOf(group, `/${name}`))
}

module.exports = router
