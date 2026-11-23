const test = require('node:test')
const assert = require('node:assert/strict')
const expected = require('./service-members.json')

test('service exposes every method it had before the move', () => {
  const service = require('../service')
  const methods = Object.keys(Object.assign({}, ...protoChain(service))).concat(Object.keys(service))
  const have = new Set(methods.filter((name) => typeof service[name] === 'function'))
  assert.deepEqual(expected.methods.filter((name) => !have.has(name)), [])
  for (const field of expected.fields) assert.notEqual(service[field], undefined, field)
  assert.equal(service.listingCapabilities.canList, true)
})

function protoChain(obj) {
  const out = []
  for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    out.push(Object.fromEntries(Object.getOwnPropertyNames(p).filter((n) => n !== 'constructor').map((n) => [n, true])))
  }
  return out
}
