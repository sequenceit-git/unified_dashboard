const test = require('node:test')
const { stubModules, freshRequire, modelStub } = require('./helpers/stub')
const { matchSnapshot } = require('./helpers/snapshot')

function routesOf(router) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`))
}

test('routes match snapshot', () => {
  const restore = stubModules({ '/models/Shop': modelStub(), '/models/Order': modelStub(), '/models/Listing': modelStub(), '/models/Product': modelStub() })
  try {
    const shops = freshRequire('routes/system/shops.js')
    const api = freshRequire('routes/system/api.js')
    matchSnapshot('routes', { shops: routesOf(shops), api: routesOf(api) })
  } finally {
    restore()
  }
})
