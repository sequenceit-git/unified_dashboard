const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

function load() {
  const calls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttPost: async (token, shop, path) => {
        calls.push(['POST', path])
        if (path === '/promotion/202309/activities/search') {
          return {
            activities: [
              { id: 'ACT1', title: 'Spring Deal', activity_type: 'FIXED_PRICE', product_level: 'PRODUCT', status: 'ONGOING', begin_time: 1764000000, end_time: 1764100000 },
              { id: 'ACT2', title: 'Winter Sale', activity_type: 'FLASHSALE', product_level: 'SHOP', status: 'EXPIRED', begin_time: 1763000000, end_time: 1763100000 },
            ],
          }
        }
        if (path === '/promotion/202406/coupons/search') {
          return {
            coupons: [
              { id: 'CPN1', title: '$5 Off', display_type: 'REGULAR', status: 'ONGOING', redemption_duration: { start_time: 1764000000, end_time: 1764100000 } },
            ],
          }
        }
        throw new Error(`unexpected POST ${path}`)
      },
      ttGet: async (token, shop, path) => {
        calls.push(['GET', path])
        if (path === '/promotion/202309/activities/ACT1') {
          return {
            id: 'ACT1',
            title: 'Spring Deal',
            activity_type: 'FIXED_PRICE',
            product_level: 'PRODUCT',
            duration_type: 'NORMAL',
            status: 'ONGOING',
            begin_time: 1764000000,
            end_time: 1764100000,
            products: [{ id: 'P1', discount: 15, activity_price: { amount: '19.99', currency: 'USD' }, quantity_limit: 5, skus: [{ id: 'S1' }] }],
          }
        }
        if (path === '/promotion/202406/coupons/CPN1') {
          return {
            id: 'CPN1',
            title: '$5 Off',
            display_type: 'REGULAR',
            status: 'ONGOING',
            target_buyer_segment: 'ALL',
            discount: { reduction_amount: { amount: '5.00', currency: 'USD' } },
            threshold: { min_spend: { amount: '25.00', currency: 'USD' } },
          }
        }
        throw new Error(`unexpected GET ${path}`)
      },
    },
    '../service': {
      call: async (token, method, path, opts) => {
        calls.push([method, path, opts?.body])
        return { ok: true }
      },
    },
  })
  return { promotions: freshRequire('marketplaces/tiktok_shop/sections/promotions.js'), calls, restore }
}

test('promotions section attaches details and modify actions', async () => {
  const { promotions, restore } = load()
  try {
    const data = await promotions('tok', { _id: 's1' })
    const [activities, coupons] = data.tables
    assert.deepEqual(activities.rows[0].actions.map((a) => a.id), ['activity', 'edit-activity', 'remove-product'])
    assert.deepEqual(activities.rows[1].actions.map((a) => a.id), ['activity', 'edit-activity', 'remove-product', 'republish'])
    assert.deepEqual(coupons.rows[0].actions.map((a) => a.id), ['coupon'])
  } finally { restore() }
})

test('activity and coupon drill-downs return structured tables', async () => {
  const { promotions, restore } = load()
  try {
    const act = await promotions.details.activity('tok', { _id: 's1' }, 'ACT1')
    assert.equal(act.title, 'Spring Deal')
    assert.equal(act.tables[1].rows[0].productId, 'P1')
    assert.equal(act.tables[1].rows[0].activityPrice.value, 19.99)

    const cpn = await promotions.details.coupon('tok', { _id: 's1' }, 'CPN1')
    assert.equal(cpn.title, '$5 Off')
    assert.ok(cpn.tables[0].rows.some((r) => r.field === 'Discount' && r.value === '5.00 USD'))
  } finally { restore() }
})

test('edit-activity (PUT), remove-product (DELETE), and republish (POST) dispatch with validation', async () => {
  const { promotions, calls, restore } = load()
  try {
    const renamed = await promotions.actions['edit-activity']('tok', { _id: 's1' }, 'ACT1', 'Summer Deal')
    assert.match(renamed.message, /Summer Deal/)
    assert.deepEqual(
      calls.find(([m, p]) => m === 'PUT' && p === '/promotion/202309/activities/ACT1')[2],
      { activity_type: 'FIXED_PRICE', product_level: 'PRODUCT', duration_type: 'NORMAL', begin_time: 1764000000, end_time: 1764100000, title: 'Summer Deal' },
    )
    await assert.rejects(promotions.actions['edit-activity']('tok', { _id: 's1' }, 'ACT1', '   '), (e) => e.status === 400)

    const removed = await promotions.actions['remove-product']('tok', { _id: 's1' }, 'ACT1', 'P1, P2')
    assert.match(removed.message, /2 product/)
    assert.deepEqual(
      calls.find(([m, p]) => m === 'DELETE' && p === '/promotion/202309/activities/ACT1/products')[2],
      { product_ids: ['P1', 'P2'], sku_ids: [] },
    )
    await assert.rejects(promotions.actions['remove-product']('tok', { _id: 's1' }, 'ACT1', ''), (e) => e.status === 400)

    const republished = await promotions.actions.republish('tok', { _id: 's1' }, 'ACT2')
    assert.match(republished.message, /ACT2/)
    assert.ok(calls.some(([m, p]) => m === 'POST' && p === '/promotion/202607/activities/ACT2/republish'))
  } finally { restore() }
})
