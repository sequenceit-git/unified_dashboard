/**
 * eBay's dashboard API, mounted at /api/ebay: the route groups eBay has. Handlers and services
 * live in this folder (routes/, services/); the shop is fixed by the URL.
 */
const express = require('express')

const GROUPS = {
  listings: require('./routes/products'),
  inventory: require('./routes/inventory'),
  orders: require('./routes/orders'),
  buyers: require('./routes/customers'),
  messages: require('./routes/inbox'),
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
  const group = build('ebay')
  router.use(`/${name}`, group)
  router.routeList.push(...routesOf(group, `/${name}`))
}

module.exports = router
