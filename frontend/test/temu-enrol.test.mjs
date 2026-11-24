import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/promotions/enrolView.js')
test.after(() => server.close())

const GOODS = [
  { goodsId: '77', title: 'Phone case', quantity: 30, skus: [{ skuId: '1', price: 850 }, { skuId: '2', price: 900 }] },
  { goodsId: '88', title: '', quantity: 10, skus: [{ skuId: '5', price: 400 }] },
]

test('starts from Temu\'s recommendation, in dollars', async () => {
  const { startEdits } = await load()
  assert.deepEqual(startEdits(GOODS)['77'], { quantity: '30', prices: { 1: '8.50', 2: '9.00' } })
})

test('what is sent: picked goods only, prices in cents', async () => {
  const { startEdits, enrolItems } = await load()
  const edits = startEdits(GOODS)
  edits['77'].prices['1'] = '7.99'
  edits['77'].quantity = '12'
  assert.deepEqual(enrolItems(GOODS, new Set(['77']), edits), [{ goodsId: '77', quantity: 12, skus: [{ skuId: '1', price: 799 }, { skuId: '2', price: 900 }] }])
})

test('problems per step: nothing picked, bad quantity, price above Temu or empty', async () => {
  const { startEdits, enrolProblems } = await load()
  const edits = startEdits(GOODS)
  assert.deepEqual(enrolProblems(GOODS, new Set(), edits).map((p) => p.step), ['pick'])
  edits['77'].quantity = '0'
  edits['77'].prices['1'] = '9.00'
  edits['77'].prices['2'] = ''
  const p = enrolProblems(GOODS, new Set(['77']), edits)
  assert.deepEqual(p.map((x) => x.step), ['prices', 'prices', 'prices'])
  assert.match(p.map((x) => x.message).join(' | '), /quantity.*\|.*above Temu's \$8\.50.*\|.*price/i)
})

test('a big cut is flagged, not blocked', async () => {
  const { startEdits, bigCuts } = await load()
  const edits = startEdits(GOODS)
  edits['88'].prices['5'] = '1.00'
  assert.deepEqual(bigCuts(GOODS, new Set(['77', '88']), edits), ['Goods 88 · SKU 5: $1.00 is 75% below Temu’s $4.00'])
})
