/**
 * Read-only data for the shop-specific sections (returns, finances, promotions, ...).
 * Each loader returns `{ summary: [{label, value, type}], tables: [{id, title, columns, rows}] }`
 * so one page can render any shop's section. Column types: text, money, date, number, status, link.
 */

const ebayConfig = require('../../config/marketplaces').ebay
const { ebayFetch } = require('./ebayHttp')
const { money, words, col, tables, listingTitles } = require('./sectionKit')

const ebayGet = ebayFetch
const ebayApiz = () => (ebayConfig.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com')

const EBAY = {
  async returns(token) {
    const list = await tables([
      {
        id: 'returns',
        title: 'Returns',
        columns: [col('returnId', 'Return'), col('orderId', 'Order'), col('buyer', 'Buyer'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date'), col('url', '', 'link')],
        load: async () => (await ebayGet(token, '/post-order/v2/return/search?limit=50', { iaf: true })).members?.map((row) => ({
          returnId: row.returnId,
          orderId: row.orderId,
          buyer: row.buyerLoginName,
          reason: [words(row.creationInfo?.reason), row.creationInfo?.comments?.content].filter(Boolean).join(': '),
          status: words(row.status || row.state),
          refund: money(row.sellerTotalRefund?.estimatedRefundAmount),
          respondBy: row.sellerResponseDue?.respondByDate?.value || null,
          created: row.creationInfo?.creationDate?.value || null,
          url: `https://www.ebay.com/rt/ReturnDetails?returnId=${row.returnId}`,
        })) || [],
      },
      {
        id: 'cancellations',
        title: 'Cancellations',
        columns: [col('cancelId', 'Cancellation'), col('orderId', 'Order'), col('item', 'Item'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
        load: async () => (await ebayGet(token, '/post-order/v2/cancellation/search?limit=50', { iaf: true })).cancellations?.map((row) => ({
          cancelId: row.cancelId,
          orderId: row.legacyOrderId || row.orderId || '',
          item: row.lineItems?.map((line) => line.itemTitle).join(', ') || '',
          reason: words(row.cancelReason),
          status: words(row.cancelStatus),
          refund: money(row.requestRefundAmount),
          created: row.cancelRequestDate?.value || null,
        })) || [],
      },
      {
        id: 'cases',
        title: 'Cases',
        columns: [col('caseId', 'Case'), col('itemId', 'Item'), col('buyer', 'Buyer'), col('status', 'Status', 'status'), col('claim', 'Claim', 'money'), col('respondBy', 'Respond by', 'date'), col('created', 'Opened', 'date')],
        load: async () => (await ebayGet(token, '/post-order/v2/casemanagement/search?limit=50', { iaf: true })).members?.map((row) => ({
          caseId: String(row.caseId),
          itemId: String(row.itemId),
          buyer: row.buyer,
          status: words(row.caseStatusEnum),
          claim: money(row.claimAmount),
          respondBy: row.respondByDate?.value || null,
          created: row.creationDate?.value || null,
        })) || [],
      },
    ])
    const open = (rows, closed) => rows.filter((row) => !closed.test(row.status)).length
    return {
      summary: [
        { label: 'Open returns', value: open(list[0].rows, /closed/i), type: 'number' },
        { label: 'Open cancellations', value: open(list[1].rows, /closed/i), type: 'number' },
        { label: 'Open cases', value: open(list[2].rows, /closed/i), type: 'number' },
      ],
      tables: list,
    }
  },

  async finances(token) {
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
  },

  async promotions(token) {
    const list = await tables([{
      id: 'promotions',
      title: 'Promotions',
      columns: [col('name', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
      load: async () => (await ebayGet(token, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=100')).promotions?.map((row) => ({
        promotionId: row.promotionId,
        name: row.name,
        type: words(row.promotionType),
        status: words(row.promotionStatus),
        start: row.startDate,
        end: row.endDate,
      })) || [],
    }])
    const rows = list[0].rows
    return {
      summary: [
        { label: 'Running', value: rows.filter((row) => /running/i.test(row.status)).length, type: 'number' },
        { label: 'Scheduled', value: rows.filter((row) => /scheduled/i.test(row.status)).length, type: 'number' },
        { label: 'Total', value: rows.length, type: 'number' },
      ],
      tables: list,
    }
  },

  async offers(token) {
    const list = await tables([{
      id: 'eligible',
      title: 'Listings with interested buyers',
      note: 'Send targeted discount offers directly to buyers and watchers watching these items.',
      columns: [col('listingId', 'Item'), col('title', 'Product'), col('sku', 'SKU'), col('url', '', 'link')],
      load: async () => {
        const ids = (await ebayGet(token, '/sell/negotiation/v1/find_eligible_items?limit=200')).eligibleItems?.map((row) => row.listingId) || []
        const titles = await listingTitles('ebay', ids)
        return ids.map((id) => ({
          listingId: id,
          title: titles.get(id)?.title || '',
          sku: titles.get(id)?.sku || '',
          url: `https://www.ebay.com/itm/${id}`,
        }))
      },
    }])
    return { summary: [{ label: 'Eligible listings', value: list[0].rows.length, type: 'number' }], tables: list }
  },
}

const LOADERS = { ebay: EBAY, tiktok_shop: require('../../marketplaces/tiktok_shop/sections'), temu: require('../../marketplaces/temu/sections') }

function hasLoader(marketplace, sectionId) {
  return typeof LOADERS[marketplace]?.[sectionId] === 'function'
}

function load(marketplace, sectionId, token, shop) {
  return LOADERS[marketplace][sectionId](token, shop)
}

module.exports = { hasLoader, load, LOADERS }
