/**
 * Builds one shop's dashboard API (/api/<urlId>/…) from the groups its adapter lists in
 * marketplaces/<key>/api.js. The routes and the logic behind them are shared; the shop is fixed
 * by the URL, and a shop only gets the groups it has (Temu has no inbox).
 */
const express = require('express')

const GROUPS = {
  products: () => require('./products'),
  inventory: () => require('./inventory'),
  orders: () => require('./orders'),
  customers: () => require('./customers'),
  inbox: () => require('./inbox'),
  analytics: () => require('./analytics'),
  sections: () => require('./sections'),
  shops: () => require('./shopTools'),
}

/** "METHOD /path" for each route of a router (Express keeps no mount paths, so shopApi records them). */
const routesOf = (router, prefix = '') => router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${layer.route.path}`))

function shopApi(shopKey, groups) {
  const router = express.Router()
  router.routeList = []
  for (const name of groups) {
    if (!GROUPS[name]) throw new Error(`Unknown API group ${name}`)
    const group = GROUPS[name]()(shopKey)
    router.use(`/${name}`, group)
    router.routeList.push(...routesOf(group, `/${name}`))
  }
  return router
}

module.exports = { shopApi, GROUPS: Object.keys(GROUPS) }
