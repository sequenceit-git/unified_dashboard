/**
 * Read-only data for the shop-specific sections (returns, finances, promotions, ...).
 * Each loader returns `{ summary: [{label, value, type}], tables: [{id, title, columns, rows}] }`
 * so one page can render any shop's section. Column types: text, money, date, number, status, link.
 */

const ebayConfig = require('../../config/marketplaces').ebay
const tiktok = require('./tiktok')
const Listing = require('../../models/Listing')
const Product = require('../../models/Product')

async function ebayGet(token, url, { iaf = false } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${ebayConfig.apiBaseUrl}${url}`, {
    headers: {
      Authorization: iaf ? `IAF ${token}` : `Bearer ${token}`,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.errors?.[0]?.message || body.error?.[0]?.message || `eBay returned ${res.status}`)
  return body
}

const money = (amount) => (amount && amount.value != null
  ? { value: Number(amount.value), currency: amount.currency || 'USD' }
  : null)
const ttMoney = (value, currency) => (value != null && value !== '' ? { value: Number(value), currency: currency || 'USD' } : null)
const seconds = (value) => (value ? new Date(Number(value) * (String(value).length > 11 ? 1 : 1000)).toISOString() : null)
const words = (value) => (value ? String(value).replace(/^CS_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '')
const col = (key, label, type = 'text') => ({ key, label, type })

/** Settles each table on its own, so one failing API doesn't hide the others. */
async function tables(list) {
  return Promise.all(list.map(async ({ load, ...table }) => {
    try {
      return { ...table, rows: await load() }
    } catch (err) {
      return { ...table, rows: [], error: err.message }
    }
  }))
}

async function listingTitles(marketplace, ids) {
  const listings = await Listing.find({ marketplace, externalListingId: { $in: ids } }).select('externalListingId productId').lean()
  const products = await Product.find({ _id: { $in: listings.map((row) => row.productId) } }).select('title sku').lean()
  const productById = new Map(products.map((row) => [String(row._id), row]))
  return new Map(listings.map((row) => [row.externalListingId, productById.get(String(row.productId))]))
}

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
          orderId: row.legacyOrderId,
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
      ebayGet(token, 'https://apiz.ebay.com/sell/finances/v1/payout_summary').catch(() => null),
      tables([
        {
          id: 'payouts',
          title: 'Payouts',
          columns: [col('payoutId', 'Payout'), col('date', 'Date', 'date'), col('status', 'Status', 'status'), col('amount', 'Amount', 'money'), col('fee', 'Fee', 'money'), col('transactions', 'Transactions', 'number'), col('account', 'Paid to')],
          load: async () => (await ebayGet(token, 'https://apiz.ebay.com/sell/finances/v1/payout?limit=50&sort=-payoutDate')).payouts?.map((row) => ({
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
          load: async () => (await ebayGet(token, 'https://apiz.ebay.com/sell/finances/v1/transaction?limit=50&sort=-transactionDate')).transactions?.map((row) => {
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
      note: 'eBay lets you send these buyers an offer. Send offers in Seller Hub.',
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

const ttPost = (token, shop, path, body = {}, query = { page_size: 50 }) => tiktok.call(token, 'POST', path, { shop, query, body })
const ttGet = (token, shop, path, query) => tiktok.call(token, 'GET', path, { shop, query })
const ttRange = (days) => {
  const to = new Date()
  const from = new Date(to - days * 86400000)
  return { start_date_ge: from.toISOString().slice(0, 10), end_date_lt: to.toISOString().slice(0, 10) }
}

const TIKTOK = {
  async fulfillment(token, shop) {
    const list = await tables([{
      id: 'packages',
      title: 'Packages',
      columns: [col('id', 'Package'), col('orders', 'Orders'), col('status', 'Status', 'status'), col('carrier', 'Carrier'), col('tracking', 'Tracking'), col('created', 'Created', 'date')],
      load: async () => (await ttPost(token, shop, '/fulfillment/202309/packages/search')).packages?.map((row) => ({
        id: row.id,
        orders: (row.orders || []).map((order) => order.id).join(', '),
        status: words(row.package_status || row.status),
        carrier: row.shipping_provider_name || '',
        tracking: row.tracking_number || '',
        created: seconds(row.create_time),
      })) || [],
    }])
    return { summary: [{ label: 'Packages', value: list[0].rows.length, type: 'number' }], tables: list }
  },

  async returns(token, shop) {
    const list = await tables([
      {
        id: 'returns',
        title: 'Returns and refunds',
        columns: [col('id', 'Return'), col('orderId', 'Order'), col('type', 'Type'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Opened', 'date')],
        load: async () => (await ttPost(token, shop, '/return_refund/202309/returns/search')).return_orders?.map((row) => ({
          id: row.return_id,
          orderId: row.order_id,
          type: words(row.return_type),
          reason: row.return_reason_text || words(row.return_reason),
          status: words(row.return_status),
          refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
          created: seconds(row.create_time),
        })) || [],
      },
      {
        id: 'cancellations',
        title: 'Cancellations',
        columns: [col('id', 'Cancellation'), col('orderId', 'Order'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
        load: async () => (await ttPost(token, shop, '/return_refund/202309/cancellations/search')).cancellations?.map((row) => ({
          id: row.cancel_id,
          orderId: row.order_id,
          reason: row.cancel_reason_text || words(row.cancel_reason),
          status: words(row.cancel_status),
          refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
          created: seconds(row.create_time),
        })) || [],
      },
    ])
    return {
      summary: [
        { label: 'Returns', value: list[0].rows.length, type: 'number' },
        { label: 'Cancellations', value: list[1].rows.length, type: 'number' },
      ],
      tables: list,
    }
  },

  async promotions(token, shop) {
    const list = await tables([
      {
        id: 'activities',
        title: 'Promotions',
        columns: [col('title', 'Name'), col('type', 'Type'), col('scope', 'Applies to'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
        load: async () => (await ttPost(token, shop, '/promotion/202309/activities/search', { page_size: 100 }, {})).activities?.map((row) => ({
          title: row.title,
          type: words(row.activity_type),
          scope: row.product_level === 'SHOP' ? 'Whole shop' : words(row.product_level),
          status: words(row.status),
          start: seconds(row.begin_time),
          end: row.duration_type === 'INDEFINITE' ? null : seconds(row.end_time),
        })) || [],
      },
      {
        id: 'coupons',
        title: 'Coupons',
        columns: [col('title', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
        load: async () => (await ttPost(token, shop, '/promotion/202406/coupons/search')).coupons?.map((row) => ({
          title: row.title || row.name || row.id,
          type: words(row.display_type || row.coupon_type),
          status: words(row.status),
          start: seconds(row.redemption_period?.start_time || row.start_time),
          end: seconds(row.redemption_period?.end_time || row.end_time),
        })) || [],
      },
    ])
    return {
      summary: [
        { label: 'Ongoing promotions', value: list[0].rows.filter((row) => /ongoing/i.test(row.status)).length, type: 'number' },
        { label: 'Coupons', value: list[1].rows.length, type: 'number' },
      ],
      tables: list,
    }
  },

  async finances(token, shop) {
    const list = await tables([
      {
        id: 'statements',
        title: 'Statements',
        columns: [col('id', 'Statement'), col('date', 'Date', 'date'), col('revenue', 'Revenue', 'money'), col('fees', 'Fees', 'money'), col('settlement', 'Settlement', 'money'), col('status', 'Status', 'status')],
        load: async () => (await ttGet(token, shop, '/finance/202309/statements', { page_size: 50, sort_field: 'statement_time' })).statements?.map((row) => ({
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
        load: async () => (await ttGet(token, shop, '/finance/202309/payments', { page_size: 50, sort_field: 'create_time' })).payments?.map((row) => ({
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
  },

  async content(token, shop) {
    const range = ttRange(30)
    const gmv = (perf) => ttMoney(perf?.gmv?.amount, perf?.gmv?.currency)
    const list = await tables([
      {
        id: 'videos',
        title: 'Shoppable videos (last 30 days)',
        columns: [col('title', 'Video'), col('creator', 'Creator'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
        load: async () => (await ttGet(token, shop, '/analytics/202409/shop_videos/performance', { ...range, page_size: 50 })).videos?.map((row) => ({
          title: row.title || row.id,
          creator: row.username || '',
          posted: row.video_post_time || null,
          views: Number(row.views ?? 0),
          orders: Number(row.sku_orders ?? 0),
          gmv: gmv(row),
        })) || [],
      },
      {
        id: 'lives',
        title: 'LIVE sessions (last 30 days)',
        columns: [col('title', 'Session'), col('creator', 'Host'), col('start', 'Started', 'date'), col('viewers', 'Viewers', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
        load: async () => (await ttGet(token, shop, '/analytics/202508/shop_lives/performance', { ...range, page_size: 50 })).live_stream_sessions?.map((row) => ({
          title: row.title || row.id,
          creator: row.username || '',
          start: seconds(row.start_time),
          viewers: Number(row.interaction_performance?.viewers ?? row.viewers ?? 0),
          orders: Number(row.sales_performance?.sku_orders ?? 0),
          gmv: gmv(row.sales_performance),
        })) || [],
      },
    ])
    return {
      summary: [
        { label: 'Videos', value: list[0].rows.length, type: 'number' },
        { label: 'LIVE sessions', value: list[1].rows.length, type: 'number' },
      ],
      tables: list,
    }
  },
}

const LOADERS = { ebay: EBAY, tiktok_shop: TIKTOK, temu: {} }

function hasLoader(marketplace, sectionId) {
  return typeof LOADERS[marketplace]?.[sectionId] === 'function'
}

function load(marketplace, sectionId, token, shop) {
  return LOADERS[marketplace][sectionId](token, shop)
}

module.exports = { hasLoader, load }
