/**
 * Test helpers. `stubModules` swaps modules for test doubles by the end of the `require` string,
 * so tests run without MongoDB, Redis or marketplace APIs.
 */
const Module = require('module')
const path = require('path')

const BACKEND = path.join(__dirname, '..', '..')

/**
 * @param {Record<string, any>} map  require-string suffix → value to return instead
 * @returns {() => void} restore
 */
function stubModules(map) {
  const original = Module._load
  const keys = Object.keys(map)
  Module._load = function load(request, parent, isMain) {
    const key = keys.find((suffix) => request === suffix || request.endsWith(suffix.startsWith('/') ? suffix : `/${suffix}`) || request.endsWith(suffix))
    if (key !== undefined) return map[key]
    return original.call(this, request, parent, isMain)
  }
  return () => { Module._load = original }
}

/** Requires a backend file with a clean module cache (so stubs apply to everything it loads). */
function freshRequire(relOrAbs) {
  for (const id of Object.keys(require.cache)) {
    // Models stay cached: Mongoose can register each model only once. Stubs still win, because
    // stubModules intercepts before the cache lookup.
    if (id.startsWith(BACKEND) && !id.includes(`${path.sep}node_modules${path.sep}`) && !id.includes(`${path.sep}models${path.sep}`)) {
      delete require.cache[id]
    }
  }
  return require(path.isAbsolute(relOrAbs) ? relOrAbs : path.join(BACKEND, relOrAbs))
}

/** A chainable Mongoose-ish model stub: find/findOne(...).select/sort/limit/lean all resolve to `result(query)`. */
function modelStub(result = () => null, extra = {}) {
  const chain = (value) => {
    const p = Promise.resolve(value)
    for (const m of ['select', 'sort', 'limit', 'lean', 'skip', 'populate']) p[m] = () => p
    return p
  }
  return {
    find: (q) => chain(result(q) ?? []),
    findOne: (q) => chain(result(q)),
    findById: (id) => chain(result({ _id: id })),
    updateOne: async () => ({}),
    countDocuments: async () => 0,
    ...extra,
  }
}

module.exports = { stubModules, freshRequire, modelStub, BACKEND }
