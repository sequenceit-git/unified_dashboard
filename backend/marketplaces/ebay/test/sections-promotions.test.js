const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const USD = (v) => ({ value: String(v), currency: 'USD' })
function load(fixtures) {
  const urls = []
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ebayGet: async (token, url) => {
        urls.push(url)
        const key = Object.keys(fixtures).find((k) => url.startsWith(`/sell/marketing/v1/${k}?`))
        if (!key) throw new Error(`unexpected ${url}`)
        return fixtures[key]
      },
    },
  })
  return { promotions: freshRequire('marketplaces/ebay/sections/promotions.js'), urls, restore }
}

test('promotion results show sales and discount per promotion', async () => {
  const { promotions, urls, restore } = load({
    promotion: { promotions: [{ promotionId: 'P1', name: '10% off jeans', promotionType: 'ORDER_DISCOUNT', promotionStatus: 'RUNNING' }] },
    promotion_report: { promotionReports: [{ promotionId: 'P1', promotionType: 'ORDER_DISCOUNT', numberOfOrdersSold: 4, itemsSoldQuantity: 6, promotionSale: USD(120), totalSale: USD(300), totalDiscount: USD(13.5), percentageSalesLift: '25.5' }] },
    promotion_summary_report: { totalSale: USD(300), promotionSale: USD(120), baseSale: USD(180), percentageSalesLift: '25.5' },
  })
  try {
    const { tables, summary } = await promotions('tok')
    assert.deepEqual(tables.map((t) => [t.id, t.tab]), [['promotions', 'Promotions'], ['results', 'Results']])
    const [row] = tables[1].rows
    assert.deepEqual([row.name, row.status, row.orders, row.items, row.promotionSales.value, row.discount.value, row.lift], ['10% off jeans', 'Running', 4, 6, 120, 13.5, 25.5])
    assert.ok(urls.includes('/sell/marketing/v1/promotion_report?marketplace_id=EBAY_US&limit=50'))
    assert.ok(urls.includes('/sell/marketing/v1/promotion_summary_report?marketplace_id=EBAY_US'))
    const results = Object.fromEntries(summary.filter((s) => s.tab === 'Results').map((s) => [s.label, s.value]))
    assert.equal(results['Sales from promotions'].value, 120)
    assert.equal(results['Sales lift'], 25.5)
  } finally { restore() }
})

test('an empty report shows an empty table, not an error', async () => {
  const { promotions, restore } = load({ promotion: { promotions: [] }, promotion_report: {}, promotion_summary_report: {} })
  try {
    const { tables } = await promotions('tok')
    assert.equal(tables[1].error, undefined)
    assert.deepEqual(tables[1].rows, [])
  } finally { restore() }
})

test('a promotion opens with its listings', async () => {
  const { promotions, urls, restore } = load({
    'promotion/P1/get_listing_set': { listings: [{ listingId: '111', title: 'Jeans', currentPrice: USD(20), quantity: 3 }] },
  })
  try {
    const detail = await promotions.details.items('tok', {}, 'P1')
    assert.ok(urls.includes('/sell/marketing/v1/promotion/P1/get_listing_set?limit=200'))
    assert.deepEqual(detail.tables[0].rows.map((r) => [r.listingId, r.title, r.price.value, r.quantity]), [['111', 'Jeans', 20, 3]])
  } finally { restore() }
})

test('a draft or ended promotion can be deleted', async () => {
  const sent = []
  const { promotions, restore } = load({
    promotion: { promotions: [
      { promotionId: 'P1', name: 'Old sale', promotionType: 'MARKDOWN_SALE', promotionStatus: 'ENDED' },
      { promotionId: 'P2', name: 'Draft', promotionType: 'ORDER_DISCOUNT', promotionStatus: 'DRAFT' },
      { promotionId: 'P3', name: 'Live', promotionType: 'ORDER_DISCOUNT', promotionStatus: 'RUNNING' },
    ] },
    promotion_report: { promotionReports: [] },
    promotion_summary_report: {},
  })
  const restoreClient = stubModules({ '../client': { ebaySend: async (token, method, url) => { sent.push(`${method} ${url}`); return {} } } })
  try {
    const p = freshRequire('marketplaces/ebay/sections/promotions.js')
    const rows = (await p('tok')).tables[0].rows
    const ids = (id) => rows.find((r) => r.id === id).actions.map((a) => a.id)
    assert.deepEqual([ids('P1'), ids('P2'), ids('P3')], [['items', 'delete'], ['items', 'delete'], ['items']])
    await p.actions.delete('tok', {}, 'P1')
    await p.actions.delete('tok', {}, 'P2')
    assert.deepEqual(sent, ['DELETE /sell/marketing/v1/item_price_markdown/P1', 'DELETE /sell/marketing/v1/item_promotion/P2'])
    await assert.rejects(p.actions.delete('tok', {}, 'P3'), (e) => e.status === 400)
  } finally { restoreClient(); restore() }
  void promotions
})
