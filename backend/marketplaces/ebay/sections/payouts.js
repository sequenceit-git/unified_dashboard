/**
 * eBay "payouts" section: funds not yet paid out, payouts and transactions, earnings per order
 * (net after eBay fees, ad fees, labels and refunds) and the itemised eBay bill, as tabs.
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet, ebayApiz, scopeAware } = require('./helpers')

const sum = (fees) => {
  const list = (fees || []).filter((f) => f?.amount?.value != null)
  if (!list.length) return null
  return { value: Math.round(list.reduce((t, f) => t + Number(f.amount.value), 0) * 100) / 100, currency: list[0].amount.currency || 'USD' }
}
const isAdFee = (fee) => /AD_FEE|PROMOTED/i.test(fee?.feeType || '')
const amountOf = (m) => (m?.value != null ? Number(m.value) : 0)
const round = (n) => Math.round(n * 100) / 100
const isDenied = (err) => err?.status === 403 || /permission|scope|reconnect/i.test(err?.message || '')

/**
 * Earnings per order from sale, label and refund transactions (sell.finances, which every shop
 * has), for when eBay won't give the app its order-earnings permission.
 */
function earningsFromTransactions(transactions) {
  const orders = new Map()
  const order = (id) => {
    if (!orders.has(id)) orders.set(id, { orderId: id, date: null, buyer: '', gross: 0, ebayFees: 0, adFees: 0, shippingLabels: 0, refunds: 0, currency: null, sale: false })
    return orders.get(id)
  }
  for (const t of transactions || []) {
    if (!t.orderId) continue
    const o = order(t.orderId)
    o.currency ||= t.amount?.currency
    if (t.transactionType === 'SALE') {
      const fees = (t.orderLineItems || []).flatMap((l) => l.marketplaceFees || [])
      o.sale = true
      o.date ||= t.transactionDate
      o.buyer ||= t.buyer?.username || ''
      o.gross += amountOf(t.totalFeeBasisAmount) || amountOf(t.amount) + amountOf(t.totalFeeAmount)
      o.ebayFees += fees.filter((f) => !isAdFee(f)).reduce((s, f) => s + amountOf(f.amount), 0)
      o.adFees += fees.filter(isAdFee).reduce((s, f) => s + amountOf(f.amount), 0)
    } else if (t.transactionType === 'SHIPPING_LABEL') {
      o.shippingLabels += (t.bookingEntry === 'CREDIT' ? -1 : 1) * amountOf(t.amount)
    } else if (t.transactionType === 'REFUND') {
      o.refunds += (t.bookingEntry === 'CREDIT' ? -1 : 1) * amountOf(t.amount)
    }
  }
  const m = (value, currency) => ({ value: round(value), currency: currency || 'USD' })
  return [...orders.values()].filter((o) => o.sale).map((o) => ({
    orderId: o.orderId,
    date: o.date,
    buyer: o.buyer,
    gross: m(o.gross, o.currency),
    ebayFees: m(o.ebayFees, o.currency),
    adFees: m(o.adFees, o.currency),
    shippingLabels: m(o.shippingLabels, o.currency),
    refunds: m(o.refunds, o.currency),
    net: m(o.gross - o.ebayFees - o.adFees - o.shippingLabels - o.refunds, o.currency),
  }))
}

/** The Order earnings tiles, added up from the per-order rows. */
function transactionTotals(rows) {
  if (!rows?.length) return []
  const currency = rows[0].gross.currency
  const total = (pick) => ({ value: round(rows.reduce((t, r) => t + pick(r), 0)), currency })
  return [
    { tab: 'Order earnings', label: 'Gross sales', value: total((r) => r.gross.value), type: 'money' },
    { tab: 'Order earnings', label: 'Fees and costs', value: total((r) => r.ebayFees.value + r.adFees.value + r.shippingLabels.value), type: 'money' },
    { tab: 'Order earnings', label: 'Refunds', value: total((r) => r.refunds.value), type: 'money' },
    { tab: 'Order earnings', label: 'Net earnings', value: total((r) => r.net.value), type: 'money' },
  ]
}

const signed = (amount, entry) => {
  const m = money(amount)
  if (m && entry === 'DEBIT') m.value = -m.value
  return m
}

async function payouts(token, shop, { now = new Date() } = {}) {
  // eBay requires a filter on billing activity; the last 90 days (its limit is 120).
  const billFilter = `transactionDate:[${new Date(now.getTime() - 90 * 86400000).toISOString()}..${now.toISOString()}]`.replace(/[[\]]/g, encodeURIComponent)
  // Full paths written out at each call: the API coverage report finds endpoints by their path.
  const host = ebayApiz()
  let fromTransactions = false
  const orderEarnings = async () => (await ebayGet(token, `${host}/sell/finances/v1/order_earnings?limit=50`)).orders?.map((row) => {
    const s = row.orderEarningsSummary || {}
    const fees = s.expenses?.marketplaceFees || []
    return {
      orderId: row.orderId,
      date: row.orderCreationDate,
      buyer: row.buyer?.username || '',
      gross: money(s.grossAmount),
      ebayFees: sum(fees.filter((f) => !isAdFee(f))),
      adFees: sum(fees.filter(isAdFee)),
      shippingLabels: money(s.expenses?.shippingLabels),
      refunds: money(s.refunds),
      net: money(s.orderEarnings),
    }
  }) || []
  // Paid-out transactions of the last 90 days; brackets and braces encoded like the bill's filter.
  const txFilter = `transactionStatus:{PAYOUT},transactionDate:[${new Date(now.getTime() - 90 * 86400000).toISOString()}..${now.toISOString()}]`.replace(/[[\]{}]/g, encodeURIComponent)
  const [summary, funds, earningsSummary, list, txSummary] = await Promise.all([
    ebayGet(token, `${host}/sell/finances/v1/payout_summary`).catch(() => null),
    ebayGet(token, `${host}/sell/finances/v1/seller_funds_summary`).catch(() => null),
    scopeAware(() => ebayGet(token, `${host}/sell/finances/v1/order_earnings_summary`), 'order earnings')().catch(() => null),
    tables([
      {
        id: 'payouts',
        tab: 'Payouts',
        title: 'Payouts',
        columns: [col('payoutId', 'Payout'), col('date', 'Date', 'date'), col('status', 'Status', 'status'), col('amount', 'Amount', 'money'), col('fee', 'Fee', 'money'), col('transactions', 'Transactions', 'number'), col('account', 'Paid to')],
        load: async () => (await ebayGet(token, `${host}/sell/finances/v1/payout?limit=50`)).payouts?.map((row) => ({
          payoutId: row.payoutId,
          date: row.payoutDate,
          status: row.payoutStatusDescription || words(row.payoutStatus),
          amount: money(row.amount),
          fee: money(row.totalFee),
          transactions: row.transactionCount,
          account: [row.payoutInstrument?.nickname, row.payoutInstrument?.accountLastFourDigits && `…${row.payoutInstrument.accountLastFourDigits}`].filter(Boolean).join(' '),
          id: String(row.payoutId),
          actions: [{ id: 'payout', label: 'Transactions', detail: true }],
        })) || [],
      },
      {
        id: 'transactions',
        tab: 'Payouts',
        title: 'Recent transactions',
        columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('memo', 'Details'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('amount', 'Amount', 'money'), col('status', 'Status', 'status')],
        load: async () => (await ebayGet(token, `${host}/sell/finances/v1/transaction?limit=50`)).transactions?.map((row) => ({
          date: row.transactionDate,
          type: words(row.transactionType),
          memo: row.transactionMemo || '',
          orderId: row.orderId || '',
          buyer: row.buyer?.username || '',
          amount: signed(row.amount, row.bookingEntry),
          status: words(row.transactionStatus),
        })) || [],
      },
      {
        id: 'earnings',
        tab: 'Order earnings',
        title: 'Earnings per order',
        note: "What each order left you after eBay's fees, ad fees, shipping labels and refunds (eBay's own figures).",
        columns: [col('orderId', 'Order'), col('date', 'Date', 'date'), col('buyer', 'Buyer'), col('gross', 'Gross', 'money'), col('ebayFees', 'eBay fees', 'money'), col('adFees', 'Ad fees', 'money'), col('shippingLabels', 'Shipping labels', 'money'), col('refunds', 'Refunds', 'money'), col('net', 'Net', 'money')],
        load: async () => {
          try {
            return await orderEarnings()
          } catch (err) {
            if (!isDenied(err)) throw err
            // No order-earnings permission: work it out from the transactions instead.
            fromTransactions = true
            return earningsFromTransactions((await ebayGet(token, `${host}/sell/finances/v1/transaction?limit=200`)).transactions)
          }
        },
      },
      {
        id: 'billing',
        tab: 'eBay bill',
        title: 'eBay bill',
        note: 'Every fee and credit eBay charged: insertion and final value fees, ad fees, store subscription.',
        columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('details', 'Details'), col('orderId', 'Order'), col('amount', 'Amount', 'money')],
        // Only api.ebay.com serves billing_activity (eBay's contract): a relative path goes there; apiz answers 404.
        load: async () => (await ebayGet(token, `/sell/finances/v1/billing_activity?limit=50&filter=${billFilter}`)).billingActivities?.map((row) => ({
          date: row.billingTransactionDate,
          type: words(row.feeType),
          details: row.feeTypeDescription || '',
          orderId: row.orderId || row.listingId || '',
          amount: signed(row.amount, row.bookingEntry),
        })) || [],
      },
    ]),
    ebayGet(token, `${host}/sell/finances/v1/transaction_summary?filter=${txFilter}`).catch(() => null),
  ])
  if (fromTransactions) {
    list.find((t) => t.id === 'earnings').note = "Worked out from your eBay transactions (sales, fees, labels, refunds): eBay doesn't give this app its order-earnings report."
  }
  return {
    summary: [
      ...(funds ? [
        { tab: 'Funds', label: 'Available', value: money(funds.availableFunds), type: 'money' },
        { tab: 'Funds', label: 'Processing', value: money(funds.processingFunds), type: 'money' },
        { tab: 'Funds', label: 'On hold', value: money(funds.fundsOnHold), type: 'money' },
        { tab: 'Funds', label: 'Total', value: money(funds.totalFunds), type: 'money' },
      ] : []),
      ...(txSummary ? [
        { tab: 'Payouts', label: 'Sales (90 days)', value: money(txSummary.creditAmount), type: 'money' },
        { tab: 'Payouts', label: 'Refunds (90 days)', value: money(txSummary.refundAmount), type: 'money' },
        { tab: 'Payouts', label: 'Shipping labels (90 days)', value: money(txSummary.shippingLabelAmount), type: 'money' },
        { tab: 'Payouts', label: 'On hold', value: money(txSummary.onHoldAmount), type: 'money' },
      ].filter((t) => t.value) : []),
      ...(summary ? [
        { tab: 'Payouts', label: 'Paid out', value: money(summary.amount), type: 'money' },
        { tab: 'Payouts', label: 'Payouts', value: summary.payoutCount, type: 'number' },
        { tab: 'Payouts', label: 'Transactions', value: summary.transactionCount, type: 'number' },
      ] : []),
      ...(!earningsSummary && fromTransactions ? transactionTotals(list.find((t) => t.id === 'earnings')?.rows) : []),
      ...(earningsSummary ? [
        { tab: 'Order earnings', label: 'Gross sales', value: money(earningsSummary.grossAmount), type: 'money' },
        { tab: 'Order earnings', label: 'Fees and costs', value: money(earningsSummary.expenses), type: 'money' },
        { tab: 'Order earnings', label: 'Refunds', value: money(earningsSummary.refunds), type: 'money' },
        { tab: 'Order earnings', label: 'Net earnings', value: money(earningsSummary.orderEarnings), type: 'money' },
      ] : []),
    ],
    tables: list,
  }
}

/** Read-only drill-downs. */
payouts.details = {
  /** One payout and the transactions it paid. */
  payout: async (token, shop, id) => {
    const host = ebayApiz()
    const [p, tx] = await Promise.all([
      ebayGet(token, `${host}/sell/finances/v1/payout/${encodeURIComponent(id)}`),
      ebayGet(token, `${host}/sell/finances/v1/transaction?limit=200&filter=payoutId:%7B${encodeURIComponent(id)}%7D`).catch(() => ({ transactions: [] })),
    ])
    return {
      title: `Payout ${id}`,
      summary: [
        { label: 'Amount', value: money(p.amount), type: 'money' },
        { label: 'Fee', value: money(p.totalFee), type: 'money' },
        { label: 'Status', value: p.payoutStatusDescription || words(p.payoutStatus), type: 'text' },
        { label: 'Paid to', value: [p.payoutInstrument?.nickname, p.payoutInstrument?.accountLastFourDigits && `…${p.payoutInstrument.accountLastFourDigits}`].filter(Boolean).join(' ') || '—', type: 'text' },
      ],
      tables: [{
        id: 'transactions',
        title: 'Transactions in this payout',
        columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('orderId', 'Order'), col('amount', 'Amount', 'money')],
        rows: (tx.transactions || []).map((t) => ({ date: t.transactionDate || null, type: words(t.transactionType), orderId: t.orderId || '', amount: signed(t.amount, t.bookingEntry) })),
      }],
    }
  },
}

module.exports = payouts
