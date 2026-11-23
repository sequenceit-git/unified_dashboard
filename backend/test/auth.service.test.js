const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcryptjs')
const { stubModules, freshRequire } = require('./helpers/stub')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

async function load(users = []) {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'populate', 'lean', 'sort']) p[m] = () => p; return p }
  const User = {
    findOne: (q) => chain(users.find((u) => q.$or?.some((c) => c.email === u.email || c.username === u.username)) || null),
  }
  const restore = stubModules({
    '/models/User': User,
    '/models/UserShopAccess': { find: () => chain([]) },
    '/models/Shop': { find: () => chain([]) },
  })
  const service = freshRequire('services/auth/users.js')
  return { service, restore }
}

const hash = bcrypt.hashSync('right-password', 4)
const ctx = (body, ip = '1.2.3.4') => ({ ip, body, query: {}, params: {}, user: undefined })

test('login rejects a wrong password with 401 and never returns the hash', async () => {
  const user = { _id: 'u1', email: 'a@b.c', role: 'super_admin', status: 'active', passwordHash: hash, save: async () => {} }
  const { service, restore } = await load([user])
  try {
    await assert.rejects(service.login(ctx({ email: 'a@b.c', password: 'nope' })), (e) => e.status === 401 && e.body.error === 'Invalid credentials')
    const ok = await service.login(ctx({ email: 'A@B.C ', password: 'right-password' }))
    assert.ok(ok.token)
    assert.equal(ok.user.id, 'u1')
    assert.equal(JSON.stringify(ok).includes(hash), false)
    assert.equal('passwordHash' in ok.user, false)
  } finally { restore() }
})

test('login is throttled per IP and name after 8 failures (429)', async () => {
  const { service, restore } = await load([])
  try {
    for (let i = 0; i < 8; i += 1) await assert.rejects(service.login(ctx({ email: 'x@y.z', password: 'p' }, '9.9.9.9')), (e) => e.status === 401)
    await assert.rejects(service.login(ctx({ email: 'x@y.z', password: 'p' }, '9.9.9.9')), (e) => e.status === 429)
    await assert.rejects(service.login(ctx({ email: 'x@y.z', password: 'p' }, '8.8.8.8')), (e) => e.status === 401)
  } finally { restore() }
})

test('a deleted account gets 403', async () => {
  const { service, restore } = await load([{ _id: 'u3', email: 'd@e.f', isDeleted: true, status: 'active', passwordHash: hash }])
  try {
    await assert.rejects(service.login(ctx({ email: 'd@e.f', password: 'right-password' })), (e) => e.status === 403)
  } finally { restore() }
})
