const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const PACKAGES = (statuses) => ({ packages: statuses.map(([id, s]) => ({ id, package_status: s, orders: [{ id: `O-${id}` }] })) })

function load({ packages, shipErrors = [] }) {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttPost: async (token, shop, path, body) => {
        calls.push(['POST', path, body])
        if (path === '/fulfillment/202309/packages/search') return packages
        if (path === '/fulfillment/202309/packages/ship') return { errors: shipErrors }
        throw new Error(`unexpected ${path}`)
      },
      ttGet: async (token, shop, path) => {
        calls.push(['GET', path])
        if (path === '/fulfillment/202309/packages/P1') return { package_id: 'P1', package_status: 'IN_TRANSIT', orders: [{ id: 'O1' }], shipping_provider_name: 'USPS', tracking_number: '9400', create_time: 1764000000 }
        if (path === '/fulfillment/202309/orders/O1/tracking') return { tracking: [{ description: 'Picked up', update_time_millis: 1764000000000 }, { description: 'In transit', update_time_millis: 1764100000000 }] }
        throw new Error(`unexpected ${path}`)
      },
    },
  })
  return { packages: freshRequire('marketplaces/tiktok_shop/sections/packages.js'), calls, restore }
}

test('package detail shows tracking events', async () => {
  const { packages, restore } = load({ packages: PACKAGES([]) })
  try {
    const detail = await packages.details.package('tok', {}, 'P1')
    assert.deepEqual(detail.tables.map((t) => t.id), ['tracking'])
    assert.deepEqual(detail.tables[0].rows.map((r) => r.event), ['In transit', 'Picked up'])
    assert.ok(detail.summary.some((s) => s.label === 'Tracking' && s.value === '9400'))
  } finally { restore() }
})

test('the packages table offers Ship all ready and package details', async () => {
  const { packages, restore } = load({ packages: PACKAGES([['P1', 'AWAITING_SHIPMENT'], ['P2', 'IN_TRANSIT']]) })
  try {
    const t = (await packages('tok', {})).tables[0]
    assert.deepEqual(t.actions.map((a) => a.id), ['ship-all'])
    assert.ok(t.actions[0].confirm)
    assert.deepEqual(t.rows[0].actions, [{ id: 'package', label: 'Details', detail: true }])
  } finally { restore() }
})

test('ship-all sends only packages ready to ship', async () => {
  const { packages, calls, restore } = load({ packages: PACKAGES([['P1', 'AWAITING_SHIPMENT'], ['P2', 'IN_TRANSIT'], ['P3', 'PROCESSING']]) })
  try {
    const res = await packages.actions['ship-all']('tok', {})
    const ship = calls.find(([, p]) => p === '/fulfillment/202309/packages/ship')
    assert.deepEqual(ship[2], { packages: [{ id: 'P1', handover_method: 'DROP_OFF' }, { id: 'P3', handover_method: 'DROP_OFF' }] })
    assert.equal(res.message, 'Shipped 2 packages.')
  } finally { restore() }
})

test('ship-all with nothing ready does not call TikTok', async () => {
  const { packages, calls, restore } = load({ packages: PACKAGES([['P2', 'IN_TRANSIT']]) })
  try {
    const res = await packages.actions['ship-all']('tok', {})
    assert.equal(calls.filter(([, p]) => p.endsWith('/packages/ship')).length, 0)
    assert.equal(res.message, 'No packages are ready to ship.')
  } finally { restore() }
})

test('failed packages are reported by id', async () => {
  const { packages, restore } = load({ packages: PACKAGES([['P1', 'AWAITING_SHIPMENT'], ['P3', 'AWAITING_SHIPMENT']]), shipErrors: [{ code: 1, message: 'Address incomplete', detail: { package_id: 'P3' } }] })
  try {
    const res = await packages.actions['ship-all']('tok', {})
    assert.equal(res.message, 'Shipped 1 package. Not shipped: P3 (Address incomplete).')
  } finally { restore() }
})

test('ship-all asks TikTok for packages to ship and follows every page', async () => {
  const calls = []
  const pages = { '': { packages: [{ id: 'A1', package_status: 'PROCESSING' }], next_page_token: 't2' }, t2: { packages: [{ id: 'A2', package_status: 'PROCESSING' }] } }
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttPost: async (token, shop, path, body, query) => {
        calls.push([path, body, query])
        if (path.endsWith('/packages/search')) return pages[query?.page_token || '']
        return { errors: [] }
      },
    },
  })
  try {
    const packages = freshRequire('marketplaces/tiktok_shop/sections/packages.js')
    const res = await packages.actions['ship-all']('tok', {})
    const searches = calls.filter(([p]) => p.endsWith('/packages/search'))
    assert.deepEqual(searches.map(([, body, q]) => [body.package_status, q.page_token || '']), [['PROCESSING', ''], ['PROCESSING', 't2']])
    assert.deepEqual(calls.find(([p]) => p.endsWith('/packages/ship'))[1].packages.map((p) => p.id), ['A1', 'A2'])
    assert.equal(res.message, 'Shipped 2 packages.')
  } finally { restore() }
})
