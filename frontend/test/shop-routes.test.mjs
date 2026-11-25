import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/lib/shopRoutes.js')
test.after(() => server.close())

test('firstAllowedPath: picks the safest landing page for super admins and scoped sub-admins', async () => {
  const { firstAllowedPath } = await load()
  assert.equal(firstAllowedPath({ role: 'super_admin', mainRoutes: [] }), '/')
  assert.equal(firstAllowedPath({ role: 'sub_admin', mainRoutes: ['dashboard', 'orders'], marketplaces: ['ebay'] }), '/')
  assert.equal(firstAllowedPath({ role: 'sub_admin', mainRoutes: ['market-research', 'orders'], marketplaces: ['ebay'] }), '/market-research')
  // Specific non-base subsection permission opens that exact page instead of defaulting to /ebay/orders.
  assert.equal(
    firstAllowedPath({
      role: 'sub_admin',
      mainRoutes: ['orders'],
      allowedSections: ['ebay:returns-cases', 'returns-cases'],
      marketplaces: ['ebay'],
    }),
    '/ebay/returns-cases',
  )
  // Multi-shop sub-admin: lands on first allowed subsection of their allowed shops.
  assert.equal(
    firstAllowedPath({
      role: 'sub_admin',
      mainRoutes: ['orders'],
      allowedSections: ['temu:after-sales'],
      marketplaces: ['temu'],
    }),
    '/temu/after-sales',
  )
  assert.equal(
    firstAllowedPath({
      role: 'sub_admin',
      mainRoutes: ['products', 'orders'],
      allowedSections: ['ebay:promotions', 'temu:orders'],
      marketplaces: ['ebay', 'temu'],
    }),
    '/ebay/promotions',
  )
  assert.equal(firstAllowedPath({ role: 'sub_admin', mainRoutes: [], allowedSections: [], marketplaces: ['ebay'] }), null)
  assert.equal(firstAllowedPath({ role: 'sub_admin', mainRoutes: ['orders'], allowedSections: ['orders'], marketplaces: [] }), null)
})
