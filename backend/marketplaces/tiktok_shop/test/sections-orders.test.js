const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

function load(overrides = {}) {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push(['GET', path, query])
        if (overrides.get?.[path]) return overrides.get[path](query)
        if (path === '/fulfillment/202309/orders/split_attributes') {
          return { split_attributes: [{ can_split: true, must_split: false, must_split_reasons: '' }] }
        }
        if (path === '/order/202406/orders/TT-100/external_orders') {
          return { external_orders: [{ id: 'ERP-99', platform: 'ERP' }] }
        }
        if (path === '/order/202507/orders') {
          return { orders: [{ id: 'TT-100', line_items: [{ id: 'LI-1' }, { id: 'LI-2' }] }] }
        }
        throw new Error(`unexpected ${path}`)
      },
      ttPost: async (token, shop, path, body, query) => {
        calls.push(['POST', path, body, query])
        if (overrides.post?.[path]) return overrides.post[path](body, query)
        if (path === '/order/202606/pod_details/search') {
          return { pod_details: [{ order_line_item_id: 'LI-1', custom_text: 'Happy Birthday' }] }
        }
        if (path === '/fulfillment/202309/orders/TT-100/split') {
          return { packages: [{ id: 'PKG-1' }, { id: 'PKG-2' }] }
        }
        if (path === '/order/202406/orders/external_orders') {
          return { errors: [] }
        }
        if (path === '/order/202406/orders/external_order_search') {
          return { orders: [{ id: 'TT-100', external_order: { id: 'ERP-99', platform: 'ERP' } }] }
        }
        throw new Error(`unexpected ${path}`)
      },
    },
  })
  return { orders: freshRequire('marketplaces/tiktok_shop/sections/orders.js'), calls, restore }
}

test('ops detail loads split eligibility, POD customizations and external refs', async () => {
  const { orders, restore } = load()
  try {
    const ops = await orders.details.ops('tok', {}, 'TT-100')
    assert.equal(ops.split.canSplit, true)
    assert.equal(ops.pod[0].text, 'Happy Birthday')
    assert.deepEqual(ops.externalRefs, [{ id: 'ERP-99', platform: 'ERP' }])
  } finally { restore() }
})

test('split-order builds one group per line item and rejects single-item orders', async () => {
  const { orders, calls, restore } = load()
  try {
    const res = await orders.actions['split-order']('tok', {}, 'TT-100')
    assert.match(res.message, /Split order TT-100 into 2 packages/)
    const post = calls.find(([, p]) => p.endsWith('/split'))
    assert.equal(post[2].splittable_groups.length, 2)
  } finally { restore() }

  const single = load({
    get: { '/order/202507/orders': () => ({ orders: [{ id: 'TT-100', line_items: [{ id: 'LI-1' }] }] }) },
  })
  try {
    await assert.rejects(single.orders.actions['split-order']('tok', {}, 'TT-100'), (e) => e.status === 400)
  } finally { single.restore() }
})

test('link-external and search-external wire external order reference APIs', async () => {
  const { orders, calls, restore } = load()
  try {
    const linked = await orders.actions['link-external']('tok', {}, 'TT-100', 'REF-77')
    assert.match(linked.message, /Linked reference REF-77/)
    assert.deepEqual(
      calls.find(([, p]) => p === '/order/202406/orders/external_orders')[2],
      { orders: [{ id: 'TT-100', external_order: { id: 'REF-77', platform: 'ERP' } }] },
    )
    const found = await orders.details['search-external']('tok', {}, 'ERP-99')
    assert.equal(found.tables[0].rows[0].orderId, 'TT-100')
  } finally { restore() }
})
