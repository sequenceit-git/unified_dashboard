const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('../../../test/helpers/stub')

const DATA = {
  '/finance/202309/statements': { statements: [
    { id: 'S1', statement_time: 1763000000, currency: 'USD', revenue_amount: '100', fee_amount: '-10', settlement_amount: '90', payment_status: 'PAID' },
    { id: 'S2', statement_time: 1763100000, currency: 'GBP', revenue_amount: '50', fee_amount: '-5', settlement_amount: '45', payment_status: 'PAID' },
  ] },
  '/finance/202309/payments': { payments: [] },
  '/finance/202309/withdrawals': { withdrawals: [] },
  '/finance/202609/account_transactions': { flows: [{ transaction_id: 'T1', create_time: '1763000000', type: 'SETTLEMENT', direction: 'IN', amount: { amount: '90', currency: 'USD' } }, { transaction_id: 'T2', create_time: '1763000100', type: 'WITHDRAW', direction: 'OUT', amount: { amount: '40', currency: 'USD' } }] },
  '/finance/202507/orders/unsettled': { sum_est_settlement_amount: '25', transactions: [{ order_id: 'O9', type: 'ORDER', status: 'UNSETTLED', currency: 'USD', estimated_settlement: '2026-12-01', unsettled_reason: 'Awaiting delivery', est_settlement_amount: '25' }] },
  '/finance/202501/statements/S1/statement_transactions': { transactions: [{ id: 'X1', type: 'ORDER', order_id: 'O1', settlement_amount: '90', revenue_amount: '100' }], currency: 'USD' },
  '/finance/202501/orders/O9/statement_transactions': { currency: 'USD', sku_transactions: [{ sku_id: 'K1', product_name: 'Case', quantity: '2', revenue_amount: '30', settlement_amount: '25' }] },
}

function load(overrides = {}) {
  const calls = []
  const dataMap = { ...DATA, ...overrides }
  const restore = stubModules({
    './helpers': {
      ...require('../sections/helpers'),
      ttGet: async (token, shop, path, query) => {
        calls.push([path, query])
        if (path in overrides) {
          const val = overrides[path]
          if (val instanceof Error) throw val
          return typeof val === 'function' ? val(query) : val
        }
        if (path === '/finance/202609/account_balances') return { available_balance: { amount: query.currency === 'USD' ? '120.50' : '33', currency: query.currency } }
        if (!dataMap[path]) throw new Error(`unexpected ${path}`)
        return dataMap[path]
      },
    },
  })
  return { finance: freshRequire('marketplaces/tiktok_shop/sections/finance.js'), calls, restore }
}

test('balances stay per currency', async () => {
  const { finance, restore } = load()
  try {
    const { summary } = await finance('tok', {})
    const balances = summary.filter((s) => s.tab === 'Balance')
    assert.deepEqual(balances.map((s) => [s.label, s.value.value, s.value.currency]), [['Available balance (USD)', 120.5, 'USD'], ['Available balance (GBP)', 33, 'GBP']])
  } finally { restore() }
})

test('account transactions are signed by direction', async () => {
  const { finance, restore } = load()
  try {
    const t = (await finance('tok', {})).tables.find((x) => x.id === 'account')
    assert.equal(t.tab, 'Balance')
    assert.deepEqual(t.rows.map((r) => r.amount.value), [90, -40])
  } finally { restore() }
})

test('unsettled orders show the estimated settlement', async () => {
  const { finance, calls, restore } = load()
  try {
    const data = await finance('tok', {})
    const t = data.tables.find((x) => x.id === 'unsettled')
    assert.equal(t.tab, 'Unsettled orders')
    assert.deepEqual([t.rows[0].orderId, t.rows[0].settles, t.rows[0].amount.value, t.rows[0].reason], ['O9', '2026-12-01', 25, 'Awaiting delivery'])
    assert.deepEqual(t.rows[0].actions, [{ id: 'order', label: 'Money detail', detail: true }])
    assert.equal(calls.find(([p]) => p === '/finance/202507/orders/unsettled')[1].sort_field, 'order_create_time')
    assert.ok(data.summary.some((s) => s.tab === 'Unsettled orders' && s.value.value === 25))
  } finally { restore() }
})

test('statement detail lists its transactions', async () => {
  const { finance, restore } = load()
  try {
    const rows = (await finance('tok', {})).tables.find((x) => x.id === 'statements').rows
    assert.deepEqual(rows[0].actions, [{ id: 'statement', label: 'Transactions', detail: true }])
    const detail = await finance.details.statement('tok', {}, 'S1')
    assert.equal(detail.tables[0].rows[0].orderId, 'O1')
    assert.equal(detail.tables[0].rows[0].settlement.value, 90)
    const order = await finance.details.order('tok', {}, 'O9')
    assert.deepEqual([order.tables[0].rows[0].product, order.tables[0].rows[0].settlement.value], ['Case', 25])
  } finally { restore() }
})

test('regular sellers fall back from TradeIn account_transactions to seller financial transactions', async () => {
  const denied = () => Object.assign(new Error('Access denied'), { code: 105005 })
  const { finance, restore } = load({
    '/finance/202609/account_balances': denied(),
    '/finance/202609/account_transactions': denied(),
    '/finance/202309/withdrawals': {
      withdrawals: [
        { id: 'W1', create_time: 1763000000, type: 'SETTLE', amount: '90', currency: 'USD' },
        { id: 'W2', create_time: 1763000100, type: 'WITHDRAW', amount: '40', currency: 'USD' },
      ],
    },
  })
  try {
    const data = await finance('tok', {})
    const account = data.tables.find((x) => x.id === 'account')
    assert.equal(account.error, undefined)
    assert.deepEqual(account.rows.map((r) => [r.type, r.amount.value]), [['Settle', 90], ['Withdraw', -40]])
    assert.ok(data.summary.some((s) => s.tab === 'Balance' && s.label === 'Transactions' && s.value === 2))
  } finally { restore() }
})

test('missing Finance Information scope still surfaces when seller transactions endpoint also denies access', async () => {
  const denied = () => Object.assign(new Error('Access denied'), { code: 105005 })
  const { finance, restore } = load({
    '/finance/202609/account_balances': denied(),
    '/finance/202609/account_transactions': denied(),
    '/finance/202309/withdrawals': denied(),
  })
  try {
    const account = (await finance('tok', {})).tables.find((x) => x.id === 'account')
    assert.match(account.error, /Finance Information/)
  } finally { restore() }
})
