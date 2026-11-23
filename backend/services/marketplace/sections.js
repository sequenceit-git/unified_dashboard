/**
 * Read-only data for the shop-specific sections (returns, finances, promotions, ...).
 * Each loader returns `{ summary: [{label, value, type}], tables: [{id, title, columns, rows}] }`
 * so one page can render any shop's section. Column types: text, money, date, number, status, link.
 */

const ebayConfig = require('../../config/marketplaces').ebay
const { ebayFetch } = require('./ebayHttp')
const tiktok = require('./tiktok')
const temu = require('./temu')
const Listing = require('../../models/Listing')
const Product = require('../../models/Product')

const ebayGet = ebayFetch
const ebayApiz = () => (ebayConfig.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com')

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
  const aliases = ids.flatMap((id) => [String(id), `item-${id}`, `ebay-item-${id}`])
  const listings = await Listing.find({ marketplace, externalListingId: { $in: aliases } }).select('externalListingId productId').lean()
  const products = await Product.find({ _id: { $in: listings.map((row) => row.productId) } }).select('title sku').lean()
  const productById = new Map(products.map((row) => [String(row._id), row]))
  return new Map(listings.map((row) => [
    String(row.externalListingId || '').replace(/^(ebay-)?item-/, ''),
    productById.get(String(row.productId)),
  ]))
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
        packageId: row.id,
        orders: (row.orders || []).map((order) => order.id).join(', '),
        status: words(row.package_status || row.status),
        rawStatus: row.package_status || row.status || '',
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
        load: async () => (await ttPost(token, shop, '/return_refund/202309/returns/search', {}, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).return_orders?.map((row) => ({
          id: row.return_id,
          returnId: row.return_id,
          orderId: row.order_id,
          type: words(row.return_type),
          returnType: row.return_type || '',
          reason: row.return_reason_text || words(row.return_reason),
          status: words(row.return_status),
          rawStatus: row.return_status || '',
          refund: ttMoney(row.refund_amount?.refund_total, row.refund_amount?.currency),
          created: seconds(row.create_time),
        })) || [],
      },
      {
        id: 'cancellations',
        title: 'Cancellations',
        columns: [col('id', 'Cancellation'), col('orderId', 'Order'), col('reason', 'Reason'), col('status', 'Status', 'status'), col('refund', 'Refund', 'money'), col('created', 'Requested', 'date')],
        load: async () => (await ttPost(token, shop, '/return_refund/202309/cancellations/search', {}, { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' })).cancellations?.map((row) => ({
          id: row.cancel_id,
          cancelId: row.cancel_id,
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
          id: row.id || row.activity_id,
          promotionId: row.id || row.activity_id,
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
          start: seconds(row.redemption_duration?.start_time || row.claim_duration?.start_time || row.start_time),
          end: seconds(row.redemption_duration?.end_time || row.claim_duration?.end_time || row.end_time),
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
  },

  async content(token, shop) {
    const range = ttRange(30)
    const gmv = (perf) => ttMoney(perf?.gmv?.amount, perf?.gmv?.currency)
    const callWithFallback = async (primary, fallback) => {
      try {
        return await ttGet(token, shop, primary, { ...range, page_size: 50 })
      } catch (err) {
        if (!/version|not found|404/i.test(err.message || '')) throw err
        return ttGet(token, shop, fallback, { ...range, page_size: 50 })
      }
    }
    const list = await tables([
      {
        id: 'videos',
        title: 'Shoppable videos (last 30 days)',
        columns: [col('title', 'Video'), col('creator', 'Creator'), col('posted', 'Posted', 'date'), col('views', 'Views', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
        load: async () => (await callWithFallback('/analytics/202509/shop_videos/performance', '/analytics/202409/shop_videos/performance')).videos?.map((row) => ({
          title: row.title || row.id,
          creator: row.username || '',
          posted: row.video_post_time
            ? (/^\d+$/.test(String(row.video_post_time)) ? seconds(row.video_post_time) : String(row.video_post_time).replace(' ', 'T'))
            : null,
          views: Number(row.views ?? 0),
          orders: Number(row.sku_orders ?? 0),
          gmv: gmv(row),
        })) || [],
      },
      {
        id: 'lives',
        title: 'LIVE sessions (last 30 days)',
        columns: [col('title', 'Session'), col('creator', 'Host'), col('start', 'Started', 'date'), col('viewers', 'Viewers', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
        load: async () => (await callWithFallback('/analytics/202509/shop_lives/performance', '/analytics/202508/shop_lives/performance')).live_stream_sessions?.map((row) => ({
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

  async creators(token, shop) {
    const list = await tables([{
      id: 'creators',
      title: 'Marketplace creators',
      columns: [
        col('nickname', 'Creator'),
        col('username', 'Handle'),
        col('followers', 'Followers', 'number'),
        col('gmv', 'GMV', 'money'),
        col('avgVideoViews', 'Avg video views', 'number'),
        col('avgLiveViewers', 'Avg LIVE viewers', 'number'),
      ],
      load: async () => {
        let data
        try {
          data = await ttPost(token, shop, '/affiliate_seller/202508/marketplace_creators/search', {}, { page_size: 20 })
        } catch (err) {
          if (!/version|not found|404/i.test(err.message || '')) throw err
          data = await ttPost(token, shop, '/affiliate_seller/202505/marketplace_creators/search', {}, { page_size: 20 })
        }
        return data.creators?.map((row) => ({
        nickname: row.nickname || row.username || 'Creator',
        username: row.username ? `@${String(row.username).replace(/^@/, '')}` : '',
        followers: Number(row.follower_count ?? 0),
        gmv: row.gmv?.amount != null
          ? ttMoney(row.gmv.amount, row.gmv.currency)
          : (row.gmv_range?.minimum_amount != null ? ttMoney(row.gmv_range.minimum_amount, row.gmv_range.currency) : null),
        avgVideoViews: Number(row.avg_ec_video_view_count ?? 0),
        avgLiveViewers: Number(row.avg_ec_live_uv ?? 0),
      })) || []
      },
    }])
    return {
      summary: [{ label: 'Creators', value: list[0].rows.length, type: 'number' }],
      tables: list,
    }
  },
}

const AFTERSALES_GROUP = {
  1: 'Pending',
  2: 'Requested',
  3: 'Package shipped',
  4: 'Platform reviewing',
  5: 'Refunded',
  6: 'Rejected',
  7: 'Cancelled',
}

function temuTime(value) {
  const n = Number(value)
  if (!n) return null
  return new Date(n > 1e12 ? n : n * 1000).toISOString()
}

function temuAmount(price, currency = 'USD') {
  if (price == null || price === '') return null
  if (typeof price === 'object') {
    const value = Number(price.amount)
    return Number.isFinite(value) ? { value, currency: price.currency || currency } : null
  }
  const value = Number(price)
  return Number.isFinite(value) ? { value, currency } : null
}

function temuGoodsRows(result) {
  const goods = result.goodsList || result.pageItems || result.list || []
  const rows = []
  for (const good of goods) {
    const skus = good.skuList || good.skuInfoList || [good]
    for (const sku of skus) {
      rows.push({
        goods: good.goodsName || sku.goodsName || 'Temu goods',
        sku: sku.outSkuSn || sku.outGoodsSn || good.outGoodsSn || String(sku.skuId || good.goodsId || ''),
        price: temuAmount(sku.retailPrice || sku.price || good.price, good.currency),
        listPrice: temuAmount(sku.listPrice || good.listPrice, good.currency),
        stock: Number(sku.quantity || sku.stock || good.quantity || 0),
      })
    }
  }
  return rows
}

/** parentAfterSalesStatus (Temu Return and Refund Guide). */
const TEMU_AFTERSALES_STATUS = {
  1: 'Requested',
  2: 'Package shipped',
  3: 'Pending: return received',
  4: 'Refund processing',
  5: 'Refunded',
  6: 'Cancelled by buyer',
  7: 'Rejected',
  8: 'Pending: return label',
  9: 'Refund processing',
  10: 'Return requested',
  11: 'Platform reviewing',
}

/** Ad report values are `{ val }` objects. */
const adVal = (field) => {
  const value = field && typeof field === 'object' ? field.val : field
  const n = Number(value)
  return value == null || value === '' || !Number.isFinite(n) ? null : n
}
const adMoney = (field) => {
  const n = adVal(field)
  return n == null ? null : { value: n, currency: 'USD' }
}

/** The ads report's timestamp unit isn't documented: try milliseconds, then seconds. */
async function temuAdReport(token, days) {
  const end = Date.now()
  const start = end - days * 24 * 3600 * 1000
  try {
    return await temu.call('temu.searchrec.ad.reports.mall.query', { access_token: token, startTs: start, endTs: end })
  } catch (err) {
    if (String(err.code) !== '230012000') throw err
    return temu.call('temu.searchrec.ad.reports.mall.query', {
      access_token: token,
      startTs: Math.floor(start / 1000),
      endTs: Math.floor(end / 1000),
    })
  }
}

const TEMU = {
  async promotions(token) {
    const activityRow = (row) => ({
      id: row.activityId,
      name: row.activityName || '',
      type: words(row.activityType),
      status: words(row.activityStatus),
      joined: row.isJoinedActivity ? 'Yes' : '',
      starts: temuTime(row.activityStartTime),
      ends: temuTime(row.activityEndTime),
    })
    const columns = [col('name', 'Activity'), col('type', 'Type'), col('status', 'Status', 'status'), col('joined', 'Joined'), col('starts', 'Starts', 'date'), col('ends', 'Ends', 'date')]
    const list = await tables([
      {
        id: 'joined',
        title: 'Promotions you joined',
        columns,
        load: async () => ((await temu.call('bg.promotion.activity.query', {
          access_token: token,
          pageNumber: 1,
          pageSize: 50,
          onlyQueryJoinedActivity: true,
        })).activityList || []).map(activityRow),
      },
      {
        id: 'available',
        title: 'Temu promotions',
        note: 'Enroll goods in a promotion in Temu Seller Center.',
        columns,
        load: async () => ((await temu.call('bg.promotion.activity.query', {
          access_token: token,
          pageNumber: 1,
          pageSize: 50,
        })).activityList || []).map(activityRow),
      },
    ])
    return {
      summary: [
        { label: 'Joined', value: list[0].rows.length, type: 'number' },
        { label: 'Available', value: list[1].rows.filter((row) => !row.joined).length, type: 'number' },
      ],
      tables: list,
    }
  },

  async ads(token) {
    let report = null
    const list = await tables([
      {
        id: 'goods',
        title: 'Ads by goods (last 30 days)',
        columns: [col('goodsId', 'Goods'), col('spend', 'Spend', 'money'), col('sales', 'Ad sales', 'money'), col('orders', 'Orders', 'number'), col('roas', 'ROAS', 'number'), col('impressions', 'Impressions', 'number'), col('clicks', 'Clicks', 'number')],
        load: async () => {
          report = await temuAdReport(token, 30)
          return (report?.reportsItemList || []).map((row) => ({
            goodsId: row.goodsId,
            spend: adMoney(row.adSpend),
            sales: adMoney(row.orderPayAmt),
            orders: adVal(row.orderPayCnt),
            roas: adVal(row.roas),
            impressions: adVal(row.imprCnt),
            clicks: adVal(row.clkCnt),
          }))
        },
      },
    ])
    const totals = report?.reportsSummary || {}
    const summary = report?.summary || {}
    const pick = (all, key) => adVal(totals[all]) ?? adVal(summary[key]?.ad)
    return {
      summary: [
        { label: 'Ad spend', value: pick('adSpendAll', 'spend'), type: 'number' },
        { label: 'Ad sales', value: pick('orderPayAmtAll', 'orderPayAmt'), type: 'number' },
        { label: 'ROAS', value: pick('roasAll', 'roas'), type: 'number' },
        { label: 'Orders', value: pick('orderPayCntAll', 'orderPayCnt'), type: 'number' },
      ],
      tables: list,
    }
  },

  async returns(token) {
    const end = Math.floor(Date.now() / 1000)
    const start = end - 90 * 24 * 3600
    const list = await tables([
      {
        id: 'returns',
        title: 'Returns and refunds (last 90 days)',
        note: 'Temu lets apps approve returns (full refund) and cancellations only. Decline or partially refund in Temu Seller Center.',
        columns: [col('id', 'Request'), col('order', 'Order'), col('status', 'Status', 'status'), col('opened', 'Opened', 'date'), col('updated', 'Updated', 'date'), col('respondBy', 'Respond by', 'date')],
        load: async () => (await temu.call('bg.aftersales.parentaftersales.list.get', {
          access_token: token,
          pageNo: 1,
          pageSize: 50,
          createAtStart: start,
          createAtEnd: end,
        })).data?.map((row) => ({
          id: row.parentAfterSalesSn,
          returnId: row.parentAfterSalesSn,
          cancelId: row.parentAfterSalesSn,
          order: row.parentOrderSn,
          orderId: row.parentOrderSn,
          status: AFTERSALES_GROUP[row.afterSalesStatusGroup] || 'Open',
          opened: temuTime(row.createAt),
          updated: temuTime(row.updateAt),
          respondBy: temuTime(row.operateExpireTimeMs),
        })) || [],
      },
      {
        id: 'cancellations',
        title: 'Cancellation requests',
        columns: [col('cancelId', 'Request'), col('orderId', 'Order'), col('status', 'Status', 'status'), col('items', 'Items', 'number'), col('opened', 'Opened', 'date')],
        load: async () => ((await temu.call('bg.aftersales.cancel.list.get', {
          access_token: token,
          pageNo: 1,
          pageSize: 50,
        })).data || []).map((row) => {
          const lines = row.afterSalesInfoList || []
          const status = Number(row.parentAfterSalesStatus)
          return {
            cancelId: row.parentAfterSalesSn,
            orderId: lines[0]?.parentOrderSn || '',
            // 1 = waiting for the seller; everything else is already settled.
            status: status === 1 ? 'Pending' : (TEMU_AFTERSALES_STATUS[status] || 'Closed'),
            items: lines.reduce((sum, line) => sum + Number(line.applyGoodsNumber || 0), 0) || lines.length,
            opened: temuTime(lines[0]?.createAtMillis),
          }
        }),
      },
    ])
    const open = list[0].rows.filter((row) => !/refunded|rejected|cancelled/i.test(row.status)).length
    return {
      summary: [
        { label: 'Open requests', value: open, type: 'number' },
        { label: 'Requests', value: list[0].rows.length, type: 'number' },
        { label: 'Pending cancellations', value: list[1].rows.filter((row) => row.status === 'Pending').length, type: 'number' },
      ],
      tables: list,
    }
  },

  async prices(token) {
    const list = await tables([
      {
        id: 'reviews',
        title: 'Price reviews',
        columns: [col('id', 'Price order'), col('goodsId', 'Goods'), col('status', 'Status', 'status'), col('price', 'Price', 'money')],
        load: async () => firstList(await temu.call('bg.local.goods.priceorder.query', { access_token: token, page: 1, size: 50 })).map((row) => ({
          id: row.priceOrderId || row.id,
          goodsId: row.goodsId,
          status: words(row.priceOrderStatus || row.status || row.orderStatus),
          price: temuAmount(row.supplierPrice || row.suggestSupplyPrice || row.price, row.currency),
        })),
      },
      {
        id: 'catalog',
        title: 'Current goods prices',
        columns: [col('goods', 'Goods'), col('sku', 'SKU'), col('price', 'Price', 'money'), col('listPrice', 'List price', 'money'), col('stock', 'Stock', 'number')],
        load: async () => temuGoodsRows(await temu.call('bg.local.goods.list.query', {
          access_token: token,
          pageNo: 1,
          pageSize: 50,
          goodsSearchType: 1,
          orderField: 'price',
          orderType: 0,
        })),
      },
    ])
    return {
      summary: [
        { label: 'Price reviews', value: list[0].rows.length, type: 'number' },
        { label: 'Goods', value: list[1].rows.length, type: 'number' },
      ],
      tables: list,
    }
  },

  async fulfillment(token) {
    const list = await tables([
      {
        id: 'unshipped',
        title: 'Awaiting shipment',
        columns: [col('order', 'Order'), col('placed', 'Placed', 'date'), col('items', 'Items')],
        load: async () => (await temu.call('bg.order.list.v2.get', {
          access_token: token,
          pageNumber: 1,
          pageSize: 50,
          parentOrderStatus: 2,
          regionId: 211,
        })).pageItems?.map((row) => {
          const parent = row.parentOrderMap || row
          const lines = row.orderList || []
          return {
            order: parent.parentOrderSn,
            placed: temuTime(parent.parentOrderTime),
            items: lines.map((line) => line.goodsName || line.spec).filter(Boolean).join(', '),
          }
        }) || [],
      },
      {
        id: 'warehouses',
        title: 'Warehouses',
        columns: [col('id', 'Warehouse'), col('name', 'Name'), col('default', 'Default')],
        load: async () => firstList(await temu.call('bg.logistics.warehouse.list.get', { access_token: token })).map((row) => ({
          id: row.warehouseId || row.id,
          name: row.warehouseName || row.name || '',
          default: row.defaultWarehouse ? 'Yes' : '',
        })),
      },
      {
        id: 'templates',
        title: 'Freight templates',
        columns: [col('id', 'Template'), col('name', 'Name')],
        load: async () => firstList(await temu.call('bg.freight.template.list.query', { access_token: token })).map((row) => ({
          id: row.templateId || row.freightTemplateId || row.id,
          name: row.templateName || row.freightTemplateName || row.name || '',
        })),
      },
    ])
    return {
      summary: [
        { label: 'Awaiting shipment', value: list[0].rows.length, type: 'number' },
        { label: 'Warehouses', value: list[1].rows.length, type: 'number' },
        { label: 'Freight templates', value: list[2].rows.length, type: 'number' },
      ],
      tables: list,
    }
  },
}

function firstList(result) {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  return Object.values(result).find(Array.isArray) || []
}

const LOADERS = { ebay: EBAY, tiktok_shop: TIKTOK, temu: TEMU }

function hasLoader(marketplace, sectionId) {
  return typeof LOADERS[marketplace]?.[sectionId] === 'function'
}

function load(marketplace, sectionId, token, shop) {
  return LOADERS[marketplace][sectionId](token, shop)
}

module.exports = { hasLoader, load, LOADERS }
