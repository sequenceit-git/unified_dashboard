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

async function loadForMe(me, others = []) {
  const chain = (v) => { const p = Promise.resolve(v); for (const m of ['select', 'populate', 'lean', 'sort']) p[m] = () => p; return p }
  const User = {
    findById: () => chain(me),
    findOne: (q) => chain(others.find((u) => q.$or?.some((c) => c.email === u.email || c.username === u.username)) || null),
  }
  const restore = stubModules({
    '/models/User': User,
    '/models/UserShopAccess': { find: () => chain([]) },
    '/models/Shop': { find: () => chain([]) },
  })
  return { service: freshRequire('services/auth/users.js'), restore }
}

const meCtx = (body) => ({ ip: '1.1.1.1', body, query: {}, params: {}, user: { id: 'm1' } })

test('updateMe needs the current password, then changes email and password', async () => {
  let saved = 0
  const me = { _id: 'm1', email: 'old@x.io', username: 'old@x.io', role: 'super_admin', status: 'active', passwordHash: hash, save: async () => { saved += 1 } }
  const { service, restore } = await loadForMe(me)
  try {
    await assert.rejects(service.updateMe(meCtx({ currentPassword: 'wrong', email: 'new@x.io' })), (e) => e.status === 400 && /Current password/.test(e.body.error))
    await assert.rejects(service.updateMe(meCtx({ currentPassword: 'right-password', newPassword: 'short' })), (e) => e.status === 400)
    await assert.rejects(service.updateMe(meCtx({ currentPassword: 'right-password', email: 'old@x.io' })), (e) => e.body.error === 'Nothing to change')
    assert.equal(saved, 0)
    const out = await service.updateMe(meCtx({ currentPassword: 'right-password', email: ' New@X.io ', newPassword: 'brand-new-pass' }))
    assert.equal(out.email, 'new@x.io')
    assert.equal(me.username, 'new@x.io')
    assert.ok(bcrypt.compareSync('brand-new-pass', me.passwordHash))
    assert.equal('passwordHash' in out, false)
    assert.equal(saved, 1)
  } finally { restore() }
})

test('updateMe refuses an email another account uses', async () => {
  const me = { _id: 'm1', email: 'me@x.io', role: 'super_admin', status: 'active', passwordHash: hash, save: async () => {} }
  const { service, restore } = await loadForMe(me, [{ _id: 'o1', email: 'taken@x.io', username: 'taken@x.io' }])
  try {
    await assert.rejects(service.updateMe(meCtx({ currentPassword: 'right-password', email: 'taken@x.io' })), (e) => /already in use/.test(e.body.error))
  } finally { restore() }
})
