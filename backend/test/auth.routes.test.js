const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const { stubModules, freshRequire } = require('./helpers/stub')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

test('a sub-admin gets 403 on super-admin user management', async () => {
  const sub = { _id: '64b7f0c2a1b2c3d4e5f60799', role: 'sub_admin', status: 'active', mainRoutes: ['products'] }
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'populate', 'lean', 'sort']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/User': { findById: () => chain(sub), findOne: () => chain(null), find: () => chain([]) },
    '/models/UserShopAccess': { find: () => chain([]) },
    '/models/Shop': { find: () => chain([]) },
  })
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/auth', freshRequire('routes/auth/auth.js'))
  const server = app.listen(0)
  try {
    const token = jwt.sign({ id: sub._id, role: 'sub_admin' }, process.env.JWT_SECRET)
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/users`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(res.status, 403)
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/auth/me returns fresh sub-admin routes, shops and sections', async () => {
  const sub = {
    _id: '64b7f0c2a1b2c3d4e5f60800',
    name: 'Sarah',
    username: 'sarah',
    email: 'sarah@example.com',
    role: 'sub_admin',
    status: 'active',
    mainRoutes: ['orders'],
    allowedSections: ['ebay:returns-cases', 'returns-cases'],
    marketplaces: ['ebay'],
  }
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'populate', 'lean', 'sort']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/User': { findById: () => chain(sub), findOne: () => chain(null), find: () => chain([]) },
    '/models/UserShopAccess': { find: () => chain([{ shopId: { _id: 's1', name: 'eBay Store', marketplace: 'ebay', status: 'connected' } }]) },
    '/models/Shop': { find: () => chain([{ _id: 's1', marketplace: 'ebay' }]) },
  })
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/auth', freshRequire('routes/auth/auth.js'))
  const server = app.listen(0)
  try {
    const token = jwt.sign({ id: sub._id, role: 'sub_admin' }, process.env.JWT_SECRET)
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.mainRoutes, ['orders'])
    assert.deepEqual(body.allowedSections, ['ebay:returns-cases', 'returns-cases'])
    assert.deepEqual(body.marketplaces, ['ebay'])
    assert.equal(body.shops.length, 1)
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/auth/me rejects a suspended sub-admin with 401', async () => {
  const sub = { _id: '64b7f0c2a1b2c3d4e5f60801', role: 'sub_admin', status: 'disabled' }
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'populate', 'lean', 'sort']) p[m] = () => p; return p }
  const restore = stubModules({
    '/models/User': { findById: () => chain(sub), findOne: () => chain(null), find: () => chain([]) },
    '/models/UserShopAccess': { find: () => chain([]) },
    '/models/Shop': { find: () => chain([]) },
  })
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/auth', freshRequire('routes/auth/auth.js'))
  const server = app.listen(0)
  try {
    const token = jwt.sign({ id: sub._id, role: 'sub_admin' }, process.env.JWT_SECRET)
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(res.status, 401)
  } finally {
    server.close()
    restore()
  }
})
