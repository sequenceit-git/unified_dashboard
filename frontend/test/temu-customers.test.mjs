import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/customers/customersView.js')
test.after(() => server.close())

test('pills and summary from the counts; unknown before the first load', async () => {
  const { customerPills, customerSummary } = await load()
  assert.deepEqual(customerPills({ all: 40, repeat: 7 }).map((p) => [p.key, p.count]), [['all', 40], ['repeat', 7]])
  assert.deepEqual(customerPills(null).map((p) => p.count), [null, null])
  assert.equal(customerSummary({ all: 40, repeat: 7 }), '40 buyers · 7 repeat buyers (18%)')
  assert.equal(customerSummary({ all: 1, repeat: 0 }), '1 buyer · 0 repeat buyers')
  assert.equal(customerSummary(null), '')
  assert.equal(customerSummary({ all: 3, repeat: 1 }, 'ann'), '3 matching buyers · 1 repeat buyer (33%)')
})

test('an order in the buyer drawer opens on the Orders page', async () => {
  const { orderLink } = await load()
  assert.equal(orderLink({ externalOrderId: 'PO-211-1 2' }), '/temu/orders?q=PO-211-1%202')
  assert.equal(orderLink({}), null)
})
