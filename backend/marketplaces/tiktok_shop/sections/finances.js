/** tiktok_shop "finances" section: its tables (subsections) for the shop section page. */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttGet } = require('./helpers')

async function finances(token, shop) {
  const list = await tables([
    {
      id: 'statements',
      title: 'Statements',
      columns: [col('id', 'Statement'), col('date', 'Date', 'date'), col('revenue', 'Revenue', 'money'), col('fees', 'Fees', 'money'), col('settlement', 'Settlement', 'money'), col('status', 'Status', 'status')],
      load: async () => (await ttGet(token, shop, '/finance/202309/statements', { page_size: 50, sort_field: 'statement_time', sort_order: 'DESC' })).statements?.map((row) => ({
        id: row.id,
        date: seconds(row.statement_time),
        revenue: ttMoney(row.revenue_amount, row.currency),
        fees: ttMoney(row.fee_amount, row.currency),
        settlement: ttMoney(row.settlement_amount, row.currency),
        status: words(row.payment_status),
      })) || [],
    },
    {
      id: 'payments',
      title: 'Payments',
      columns: [col('id', 'Payment'), col('date', 'Created', 'date'), col('paid', 'Paid', 'date'), col('amount', 'Amount', 'money'), col('status', 'Status', 'status')],
      load: async () => (await ttGet(token, shop, '/finance/202309/payments', { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).payments?.map((row) => ({
        id: row.id,
        date: seconds(row.create_time),
        paid: seconds(row.paid_time),
        amount: ttMoney(row.amount?.value, row.amount?.currency),
        status: words(row.status),
      })) || [],
    },
    {
      id: 'withdrawals',
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
  const settled = list[0].rows.reduce((sum, row) => sum + (row.settlement?.value || 0), 0)
  return {
    summary: [
      { label: 'Settled (listed statements)', value: { value: settled, currency: list[0].rows[0]?.settlement?.currency || 'USD' }, type: 'money' },
      { label: 'Payments', value: list[1].rows.length, type: 'number' },
      { label: 'Withdrawals', value: list[2].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = finances
