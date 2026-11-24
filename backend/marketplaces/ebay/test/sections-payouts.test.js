const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const USD = (value) => ({ value: String(value), currency: 'USD' })
const FIXTURES = {
  seller_funds_summary: { availableFunds: USD(120.5), processingFunds: USD(30), fundsOnHold: USD(10), totalFunds: USD(160.5) },
  order_earnings_summary: { grossAmount: USD(500), expenses: USD(80), refunds: USD(20), orderEarnings: USD(400), orderCount: 7 },
  'order_earnings?': { orders: [{
    orderId: '01-111', orderCreationDate: '2026-11-20T10:00:00.000Z', buyer: { username: 'amy' },
    orderEarningsSummary: {
      grossAmount: USD(50),
      expenses: { value: '9', currency: 'USD', shippingLabels: USD(4), marketplaceFees: [{ feeType: 'FINAL_VALUE_FEE', amount: USD(3) }, { feeType: 'AD_FEE', amount: USD(1.5) }, { feeType: 'INTERNATIONAL_FEE', amount: USD(0.5) }] },
      refunds: USD(5),
      orderEarnings: USD(36),
    },
  }] },
  billing_activity: { billingActivities: [{ billingTransactionDate: '2026-11-19T00:00:00.000Z', feeType: 'AD_FEE', feeTypeDescription: 'Promoted Listings fee', orderId: '01-111', bookingEntry: 'DEBIT', amount: USD(1.5) }] },
  'payout?': { payouts: [{ payoutId: 'P1', payoutDate: '2026-11-18', payoutStatus: 'SUCCEEDED', amount: USD(100) }] },
  payout_summary: { amount: USD(100), payoutCount: 1, transactionCount: 3 },
  'transaction?': { transactions: [] },
}

function load(fail = () => null) {
  const restore = stubModules({
    './helpers': {
      scopeAware: require('../sections/helpers').scopeAware,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url) => {
        const err = fail(url)
        if (err) throw err
        const key = Object.keys(FIXTURES).find((k) => url.includes(`/sell/finances/v1/${k}`))
        if (!key) throw new Error(`unexpected ${url}`)
        return FIXTURES[key]
      },
    },
  })
  return { payouts: freshRequire('marketplaces/ebay/sections/payouts.js'), restore }
}

test('funds tiles show available, processing and on hold', async () => {
  const { payouts, restore } = load()
  try {
    const { summary } = await payouts('tok')
    const funds = summary.filter((s) => s.tab === 'Funds')
    assert.deepEqual(funds.map((s) => [s.label, s.value.value]), [['Available', 120.5], ['Processing', 30], ['On hold', 10], ['Total', 160.5]])
  } finally { restore() }
})

test('earnings rows show net after fees and refunds', async () => {
  const { payouts, restore } = load()
  try {
    const { tables, summary } = await payouts('tok')
    const earnings = tables.find((t) => t.id === 'earnings')
    assert.equal(earnings.tab, 'Order earnings')
    const [row] = earnings.rows
    assert.equal(row.orderId, '01-111')
    assert.deepEqual([row.gross.value, row.ebayFees.value, row.adFees.value, row.shippingLabels.value, row.refunds.value, row.net.value], [50, 3.5, 1.5, 4, 5, 36])
    assert.deepEqual(summary.filter((s) => s.tab === 'Order earnings').map((s) => [s.label, s.value.value]), [['Gross sales', 500], ['Fees and costs', 80], ['Refunds', 20], ['Net earnings', 400]])
    const billing = tables.find((t) => t.id === 'billing')
    assert.equal(billing.tab, 'eBay bill')
    assert.equal(billing.rows[0].amount.value, -1.5)
    assert.ok(tables.filter((t) => ['payouts', 'transactions'].includes(t.id)).every((t) => t.tab === 'Payouts'))
  } finally { restore() }
})

test('earnings without the scope ask for a reconnect while payouts still load', async () => {
  const { payouts, restore } = load((url) => (/order_earnings/.test(url) ? Object.assign(new Error('Insufficient permissions'), { status: 403 }) : null))
  try {
    const { tables, summary } = await payouts('tok')
    assert.equal(tables.find((t) => t.id === 'earnings').error, 'Reconnect eBay in Settings to allow order earnings.')
    assert.equal(tables.find((t) => t.id === 'payouts').rows.length, 1)
    assert.equal(summary.filter((s) => s.tab === 'Order earnings').length, 0)
  } finally { restore() }
})

test('the eBay bill asks for the last 90 days (eBay requires a filter)', async () => {
  const urls = []
  const restore = stubModules({
    './helpers': {
      scopeAware: require('../sections/helpers').scopeAware,
      ebayApiz: () => 'https://apiz.ebay.com',
      ebayGet: async (token, url) => {
        urls.push(url)
        const key = Object.keys(FIXTURES).find((k) => url.includes(`/sell/finances/v1/${k}`))
        return FIXTURES[key]
      },
    },
  })
  try {
    const payouts = freshRequire('marketplaces/ebay/sections/payouts.js')
    await payouts('tok', {}, { now: new Date('2026-11-24T10:00:00Z') })
    const bill = urls.find((u) => u.includes('billing_activity'))
    // billing_activity is served only by api.ebay.com (eBay's contract); apiz.ebay.com answers 404 "resource not found".
    assert.equal(bill, '/sell/finances/v1/billing_activity?limit=50&filter=transactionDate:%5B2026-08-26T10:00:00.000Z..2026-11-24T10:00:00.000Z%5D')
  } finally { restore() }
})
