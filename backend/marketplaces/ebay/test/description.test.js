const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanDescription } = require('../description')

const PAGE = '<!DOCTYPE html><html><head><link rel="stylesheet" href="https://x/a.css"><meta charset="utf-8"><title>eBay</title><script>track()</script></head>'
  + '<body><div><p><strong>★ EXPERIENCE</strong> comfort</p></div></body></html>'

test('an eBay description page keeps only what is inside <body>', () => {
  assert.equal(cleanDescription(PAGE), '<div><p><strong>★ EXPERIENCE</strong> comfort</p></div>')
})

test('a plain HTML fragment is left as it is', () => {
  assert.equal(cleanDescription('<p>Soft <b>cotton</b></p>'), '<p>Soft <b>cotton</b></p>')
  assert.equal(cleanDescription('Plain text'), 'Plain text')
  assert.equal(cleanDescription(''), '')
  assert.equal(cleanDescription(undefined), '')
})

test('a page without <body> loses its head, scripts and page tags', () => {
  assert.equal(cleanDescription('<html><head><title>eBay</title><link href="x"></head><p>Hi</p><script>x()</script></html>'), '<p>Hi</p>')
})

test('styles inside the body are kept', () => {
  assert.equal(cleanDescription('<html><body><style>.a{color:red}</style><p class="a">Hi</p></body></html>'), '<style>.a{color:red}</style><p class="a">Hi</p>')
})

test('listings read from eBay get the cleaned description', () => {
  const { parseItem } = require('../trading')
  const item = parseItem({ ItemID: '1', Title: 'Jeans', Description: PAGE })
  assert.equal(item.description, '<div><p><strong>★ EXPERIENCE</strong> comfort</p></div>')
})

test('the cleanup script fixes saved descriptions: dry run first, backup before writing, nothing on a second run', async () => {
  const { run } = require('../scripts/cleanDescriptions')
  const products = [
    { _id: 'a', description: PAGE },
    { _id: 'b', description: '<p>Fine</p>' },
  ]
  const calls = []
  const db = {
    load: async () => products,
    backup: async (rows) => calls.push(['backup', rows.map((r) => r._id)]),
    write: async (rows) => { calls.push(['write', rows]); for (const [id, d] of rows) products.find((p) => p._id === id).description = d },
  }
  const log = () => {}
  assert.deepEqual(await run({ apply: false, db, log }), { products: 1, applied: false })
  assert.deepEqual(calls, [])
  await run({ apply: true, db, log })
  assert.deepEqual(calls, [['backup', ['a']], ['write', [['a', '<div><p><strong>★ EXPERIENCE</strong> comfort</p></div>']]]])
  assert.deepEqual(await run({ apply: true, db, log }), { products: 0, applied: true })
})
