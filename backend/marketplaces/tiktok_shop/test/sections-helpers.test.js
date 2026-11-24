const test = require('node:test')
const assert = require('node:assert/strict')
const { scopeAware } = require('../sections/helpers')

const MSG = "Your TikTok app doesn't have the TikTok Shop Analytics scope: enable it in Partner Center, then reconnect the shop in Settings."
const fails = (err) => scopeAware(async () => { throw err }, 'TikTok Shop Analytics')()

test('a permission error names the missing scope', async () => {
  await assert.rejects(fails(Object.assign(new Error('Access denied'), { code: 105005 })), { message: MSG })
  await assert.rejects(fails(Object.assign(new Error('Forbidden'), { status: 403 })), { message: MSG })
})

test('other errors pass through unchanged', async () => {
  await assert.rejects(fails(Object.assign(new Error('TikTok is down'), { status: 500 })), { message: 'TikTok is down' })
  // An expired login is not a missing scope.
  await assert.rejects(fails(Object.assign(new Error('Access token is expired'), { code: 105002, status: 401 })), { message: 'Access token is expired' })
  // Parameter validation errors (even with code 36009004 or mentioning "scope" field) are not OAuth scope errors.
  await assert.rejects(
    fails(Object.assign(new Error('invalid request params; detail:date cannot be empty.'), { code: 36009004 })),
    { message: 'invalid request params; detail:date cannot be empty.' },
  )
  await assert.rejects(
    fails(new Error('invalid request params: scope is required')),
    { message: 'invalid request params: scope is required' },
  )
})

test('a successful load is returned as it is', async () => {
  assert.deepEqual(await scopeAware(async (a) => [a], 'X')(7), [7])
})
