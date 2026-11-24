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
const signed = (amount, entry) => {
  const m = money(amount)
  if (m && entry === 'DEBIT') m.value = -m.value
  return m
}

async function payouts(token) {
  // Full paths written out at each call: the API coverage report finds endpoints by their path.
  const host = ebayApiz()
  const [summary, funds, earningsSummary, list] = await Promise.all([
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
        load: scopeAware(async () => (await ebayGet(token, `${host}/sell/finances/v1/order_earnings?limit=50`)).orders?.map((row) => {
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
        }) || [], 'order earnings'),
      },
      {
        id: 'billing',
        tab: 'eBay bill',
        title: 'eBay bill',
        note: 'Every fee and credit eBay charged: insertion and final value fees, ad fees, store subscription.',
        columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('details', 'Details'), col('orderId', 'Order'), col('amount', 'Amount', 'money')],
        load: async () => (await ebayGet(token, `${host}/sell/finances/v1/billing_activity?limit=50`)).billingActivities?.map((row) => ({
          date: row.billingTransactionDate,
          type: words(row.feeType),
          details: row.feeTypeDescription || '',
          orderId: row.orderId || row.listingId || '',
          amount: signed(row.amount, row.bookingEntry),
        })) || [],
      },
    ]),
  ])
  return {
    summary: [
      ...(funds ? [
        { tab: 'Funds', label: 'Available', value: money(funds.availableFunds), type: 'money' },
        { tab: 'Funds', label: 'Processing', value: money(funds.processingFunds), type: 'money' },
        { tab: 'Funds', label: 'On hold', value: money(funds.fundsOnHold), type: 'money' },
        { tab: 'Funds', label: 'Total', value: money(funds.totalFunds), type: 'money' },
      ] : []),
      ...(summary ? [
        { tab: 'Payouts', label: 'Paid out', value: money(summary.amount), type: 'money' },
        { tab: 'Payouts', label: 'Payouts', value: summary.payoutCount, type: 'number' },
        { tab: 'Payouts', label: 'Transactions', value: summary.transactionCount, type: 'number' },
      ] : []),
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

module.exports = payouts
