/**
 * TikTok Shop "finance" section: available balance and account transactions, statements (with
 * their transactions), payments, withdrawals, and orders not settled yet (with their money detail).
 */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttGet, withVersionFallback, scopeAware } = require('./helpers')

const SCOPE = 'Finance Information'
const enc = encodeURIComponent
const when = (t) => (t ? (/^\d+$/.test(String(t)) ? seconds(t) : String(t)) : null)

async function finance(token, shop) {
  let currencies = ['USD']
  let unsettledTotal = null
  const list = await tables([
    {
      id: 'statements',
      tab: 'Statements',
      title: 'Statements',
      columns: [col('id', 'Statement'), col('date', 'Date', 'date'), col('revenue', 'Revenue', 'money'), col('fees', 'Fees', 'money'), col('settlement', 'Settlement', 'money'), col('status', 'Status', 'status')],
      load: async () => {
        const rows = (await ttGet(token, shop, '/finance/202309/statements', { page_size: 50, sort_field: 'statement_time', sort_order: 'DESC' })).statements?.map((row) => ({
          id: row.id,
          date: seconds(row.statement_time),
          revenue: ttMoney(row.revenue_amount, row.currency),
          fees: ttMoney(row.fee_amount, row.currency),
          settlement: ttMoney(row.settlement_amount, row.currency),
          status: words(row.payment_status),
          actions: [{ id: 'statement', label: 'Transactions', detail: true }],
        })) || []
        const seen = [...new Set(rows.map((r) => r.settlement?.currency).filter(Boolean))]
        if (seen.length) currencies = seen
        return rows
      },
    },
    {
      id: 'payments',
      tab: 'Statements',
      title: 'Payments',
      columns: [col('id', 'Payment'), col('date', 'Created', 'date'), col('paid', 'Paid', 'date'), col('amount', 'Amount', 'money'), col('status', 'Status', 'status')],
      load: async () => (await withVersionFallback(
        () => ttGet(token, shop, '/finance/202605/payments', { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' }),
        () => ttGet(token, shop, '/finance/202309/payments', { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' }),
      )).payments?.map((row) => ({
        id: row.id,
        date: seconds(row.create_time),
        paid: seconds(row.paid_time),
        amount: ttMoney(row.amount?.value, row.amount?.currency),
        status: words(row.status),
      })) || [],
    },
    {
      id: 'withdrawals',
      tab: 'Statements',
      title: 'Withdrawals',
      columns: [col('id', 'Withdrawal'), col('date', 'Date', 'date'), col('type', 'Type'), col('amount', 'Amount', 'money'), col('status', 'Status', 'status')],
      load: async () => (await ttGet(token, shop, '/finance/202309/withdrawals', { page_size: 50, types: 'WITHDRAW' })).withdrawals?.map((row) => ({
        id: row.id,
        date: seconds(row.create_time),
        type: words(row.type),
        amount: ttMoney(row.amount, row.currency),
        status: words(row.status),
      })) || [],
    },
  ])
  // Balances need a currency: ask once per currency the shop's statements use (USD if none).
  const balances = await Promise.all(currencies.map((currency) => scopeAware(() => ttGet(token, shop, '/finance/202609/account_balances', { currency }), SCOPE)().catch(() => null)))
  const more = await tables([
    {
      id: 'account',
      tab: 'Balance',
      title: 'Account transactions',
      note: 'Money in and out of your TikTok Shop balance.',
      columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('reference', 'Reference'), col('amount', 'Amount', 'money')],
      load: scopeAware(async () => {
        try {
          const { flows = [] } = await ttGet(token, shop, '/finance/202609/account_transactions', { page_size: 50 })
          return flows.map((row) => {
            const amount = ttMoney(row.amount?.amount, row.amount?.currency)
            if (amount && /OUT/i.test(row.direction || '')) amount.value = -Math.abs(amount.value)
            return { id: row.transaction_id, date: when(row.create_time), type: words(row.type), reference: row.reference_id || row.origin_transaction_id || '', amount }
          })
        } catch (err) {
          if (err?.status === 401) throw err
          // TradeIn account_transactions rejects non-TradeIn sellers; fall back to Seller Financial Transactions.
          let res
          try {
            res = await ttGet(token, shop, '/finance/202309/withdrawals', { page_size: 50, types: 'SETTLE,TRANSFER,WITHDRAW,REVERSE' })
          } catch (fallbackErr) {
            const noPerm = fallbackErr?.status === 401 || fallbackErr?.status === 403
              || [105005, 105006, 36009004].includes(Number(fallbackErr?.code))
              || /no permission|not authori[sz]ed|access denied|scope/i.test(fallbackErr?.message || '')
            if (noPerm) throw fallbackErr
            res = await ttGet(token, shop, '/finance/202309/withdrawals', { page_size: 50, types: 'WITHDRAW' })
          }
          return (res.withdrawals || []).map((row) => {
            const amount = ttMoney(row.amount, row.currency)
            if (amount && /WITHDRAW/i.test(row.type || '')) amount.value = -Math.abs(amount.value)
            return { id: row.id, date: seconds(row.create_time), type: words(row.type), reference: row.id || '', amount }
          })
        }
      }, SCOPE),
    },
    {
      id: 'unsettled',
      tab: 'Unsettled orders',
      title: 'Orders not settled yet',
      note: 'Orders TikTok has not paid out yet, with the amount it expects to settle and when.',
      columns: [col('orderId', 'Order'), col('type', 'Type'), col('status', 'Status', 'status'), col('settles', 'Expected settlement'), col('amount', 'Estimated amount', 'money'), col('reason', 'Why not yet')],
      load: scopeAware(async () => {
        const res = await ttGet(token, shop, '/finance/202507/orders/unsettled', { page_size: 50, sort_field: 'order_create_time', sort_order: 'DESC' })
        const rows = (res.transactions || []).map((row) => ({
          id: row.order_id || row.adjustment_order_id || row.id,
          orderId: row.order_id || row.adjustment_order_id || '',
          type: words(row.type),
          status: words(row.status),
          settles: row.estimated_settlement || '',
          amount: ttMoney(row.est_settlement_amount ?? row.est_adjustment_amount, row.currency),
          reason: row.unsettled_reason || '',
          actions: row.order_id ? [{ id: 'order', label: 'Money detail', detail: true }] : [],
        }))
        if (res.sum_est_settlement_amount != null) unsettledTotal = ttMoney(res.sum_est_settlement_amount, rows[0]?.amount?.currency || currencies[0])
        return rows
      }, SCOPE),
    },
  ])
  const balanceTiles = balances.map((b, i) => b?.available_balance && {
    tab: 'Balance',
    label: `Available balance (${b.available_balance.currency || currencies[i]})`,
    value: ttMoney(b.available_balance.amount, b.available_balance.currency || currencies[i]),
    type: 'money',
  }).filter(Boolean)
  const fallbackBalanceTiles = balanceTiles.length ? [] : [
    ...(unsettledTotal ? [{ tab: 'Balance', label: 'Expected to settle', value: unsettledTotal, type: 'money' }] : []),
    { tab: 'Balance', label: 'Transactions', value: more[0].rows.length, type: 'number' },
  ]
  return {
    summary: [
      ...balanceTiles,
      ...fallbackBalanceTiles,
      { tab: 'Statements', label: 'Statements', value: list[0].rows.length, type: 'number' },
      { tab: 'Statements', label: 'Payments', value: list[1].rows.length, type: 'number' },
      ...(unsettledTotal ? [{ tab: 'Unsettled orders', label: 'Expected to settle', value: unsettledTotal, type: 'money' }] : []),
    ],
    tables: [...more, ...list],
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, tables }`. */
finance.details = {
  /** One statement's transactions. */
  statement: async (token, shop, id) => {
    const res = await ttGet(token, shop, `/finance/202501/statements/${enc(id)}/statement_transactions`, { page_size: 100, sort_field: 'order_create_time' })
    const c = res.currency
    return {
      title: `Statement ${id}`,
      tables: [{
        id: 'transactions',
        title: 'Transactions',
        columns: [col('type', 'Type'), col('orderId', 'Order'), col('revenue', 'Revenue', 'money'), col('settlement', 'Settlement', 'money')],
        rows: (res.transactions || []).map((t) => ({ type: words(t.type), orderId: t.order_id || t.adjustment_order_id || '', revenue: ttMoney(t.revenue_amount, c), settlement: ttMoney(t.settlement_amount ?? t.adjustment_amount, c) })),
      }],
    }
  },
  /** One order's money: revenue and settlement per SKU. */
  order: async (token, shop, id) => {
    const res = await ttGet(token, shop, `/finance/202501/orders/${enc(id)}/statement_transactions`)
    const c = res.currency
    return {
      title: `Order ${id}`,
      summary: [
        { label: 'Revenue', value: ttMoney(res.revenue_amount, c), type: 'money' },
        { label: 'Fees and tax', value: ttMoney(res.fee_and_tax_amount, c), type: 'money' },
        { label: 'Shipping', value: ttMoney(res.shipping_cost_amount, c), type: 'money' },
        { label: 'Settlement', value: ttMoney(res.settlement_amount, c), type: 'money' },
      ],
      tables: [{
        id: 'skus',
        title: 'Per SKU',
        columns: [col('product', 'Product'), col('sku', 'SKU'), col('quantity', 'Qty', 'number'), col('revenue', 'Revenue', 'money'), col('settlement', 'Settlement', 'money')],
        rows: (res.sku_transactions || []).map((s) => ({ product: s.product_name || '', sku: s.sku_name || s.sku_id, quantity: Number(s.quantity || 0), revenue: ttMoney(s.revenue_amount, c), settlement: ttMoney(s.settlement_amount, c) })),
      }],
    }
  },
}

module.exports = finance
