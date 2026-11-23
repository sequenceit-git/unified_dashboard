/** ebay "finances" section: its tables (subsections) for the shop section page. */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet, ebayApiz } = require('./helpers')

async function finances(token) {
  const [summary, list] = await Promise.all([
    ebayGet(token, `${ebayApiz()}/sell/finances/v1/payout_summary`).catch(() => null),
    tables([
      {
        id: 'payouts',
        title: 'Payouts',
        columns: [col('payoutId', 'Payout'), col('date', 'Date', 'date'), col('status', 'Status', 'status'), col('amount', 'Amount', 'money'), col('fee', 'Fee', 'money'), col('transactions', 'Transactions', 'number'), col('account', 'Paid to')],
        load: async () => (await ebayGet(token, `${ebayApiz()}/sell/finances/v1/payout?limit=50`)).payouts?.map((row) => ({
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
        title: 'Recent transactions',
        columns: [col('date', 'Date', 'date'), col('type', 'Type'), col('memo', 'Details'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('amount', 'Amount', 'money'), col('status', 'Status', 'status')],
        load: async () => (await ebayGet(token, `${ebayApiz()}/sell/finances/v1/transaction?limit=50`)).transactions?.map((row) => {
          const amount = money(row.amount)
          if (amount && row.bookingEntry === 'DEBIT') amount.value = -amount.value
          return {
            date: row.transactionDate,
            type: words(row.transactionType),
            memo: row.transactionMemo || '',
            orderId: row.orderId || '',
            buyer: row.buyer?.username || '',
            amount,
            status: words(row.transactionStatus),
          }
        }) || [],
      },
    ]),
  ])
  return {
    summary: summary ? [
      { label: 'Paid out', value: money(summary.amount), type: 'money' },
      { label: 'Payouts', value: summary.payoutCount, type: 'number' },
      { label: 'Transactions', value: summary.transactionCount, type: 'number' },
    ] : [],
    tables: list,
  }
}

module.exports = finances
