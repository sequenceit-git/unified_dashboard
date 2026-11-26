const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { freshRequire } = require('./helpers/stub')

delete process.env.REDIS_URL

function fakeRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headers = {}
  res.set = (k, v) => { res.headers[k] = v }
  res.json = (body) => { res.body = body; res.emit('close'); return res }
  return res
}
const req = (url) => ({ method: 'GET', query: {}, originalUrl: url, user: { role: 'super_admin' } })

test('requests arriving while the same response is built share it instead of running it again', async () => {
  const { cachedResponse } = freshRequire('services/core/cache.js')
  const mw = cachedResponse('dashboard', 30)
  let runs = 0
  const handler = (res) => { runs += 1; setTimeout(() => res.json({ n: runs }), 20) }
  const reqs = [fakeRes(), fakeRes(), fakeRes()]
  await Promise.all(reqs.map((res) => new Promise((resolve) => {
    res.on('close', resolve)
    mw(req('/api/dashboard/overview'), res, () => handler(res))
  })))
  assert.equal(runs, 1)
  assert.deepEqual(reqs.map((r) => r.body), [{ n: 1 }, { n: 1 }, { n: 1 }])
  assert.deepEqual(reqs.map((r) => r.headers['X-Cache']), ['MISS', 'HIT', 'HIT'])
})

test('a failed response is not shared: the waiting request runs on its own', async () => {
  const { cachedResponse } = freshRequire('services/core/cache.js')
  const mw = cachedResponse('dashboard', 30)
  let runs = 0
  const first = fakeRes()
  const second = fakeRes()
  const done = Promise.all([first, second].map((res) => new Promise((resolve) => res.on('close', resolve))))
  mw(req('/x'), first, () => { runs += 1; setTimeout(() => { first.statusCode = 500; first.json({ error: 'boom' }) }, 10) })
  mw(req('/x'), second, () => { runs += 1; second.json({ ok: true }) })
  await done
  assert.equal(runs, 2)
  assert.deepEqual(second.body, { ok: true })
})
