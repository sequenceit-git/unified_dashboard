/**
 * The Overview page's extra parts: previous 30 days, daily sales per shop, one card per shop,
 * needs attention, the next orders to ship, unread buyer threads, stock alerts and top products.
 * Only the dashboard's own database; every query keeps the caller's shop scope. Each part fails
 * on its own (its error is in `errors`).
 */
const Order = require('../../models/Order')
const Listing = require('../../models/Listing')
const Shop = require('../../models/Shop')
const SyncLog = require('../../models/SyncLog')
const Product = require('../../models/Product')
const Conversation = require('../../models/Conversation')
const marketplaces = require('../../marketplaces')
const { decrypt } = require('../../utils/recipientPii')

const DAY = 86400000
const TO_SHIP = ['pending', 'paid', 'processing']
const NOT_SOLD = ['cancelled', 'refunded']
const OPEN_RETURNS_MATCH = { $or: [{ status: 'returned' }, { 'returns.status': 'requested' }] }
const UNREAD_BUYER_MATCH = { status: 'open', replyable: { $ne: false }, unreadCount: { $gt: 0 } }
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const dayKey = (d) => d.toISOString().slice(0, 10)

function capability(marketplace, key) {
  try {
    return Boolean(marketplaces.get(marketplace)?.capabilities?.[key])
  } catch {
    return false
  }
}

/** True when this connected marketplace automatically refreshes short-lived access tokens. */
function canAutoRefresh(shop) {
  return Boolean(shop?.auth?.refreshTokenEnc && capability(shop.marketplace, 'refreshToken'))
}

/**
 * `days` UTC days ending today, each `{ date, shops: { <marketplace>: { revenue, orders } } }`. The
 * default 31 covers the 30-day window (now − 30 days), whose first day is partial.
 */
function dailySeries(rows, now, days = 31) {
  const byDay = new Map()
  for (const r of rows || []) {
    const shops = byDay.get(r._id.day) || {}
    shops[r._id.marketplace] = { revenue: round(r.revenue), orders: r.orders || 0 }
    byDay.set(r._id.day, shops)
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(new Date(today.getTime() - (days - 1 - i) * DAY))
    return { date, shops: byDay.get(date) || {} }
  })
}

/** One card per visible shop, with its 30-day sales, fulfillment, stock alerts, inbox and health. */
function shopCards(shops, { sales = [], prevSales = [], toShip = [], live = [], listingErrors = [], returns = [], unread = [], stockByShop = [], failingSyncs = [] } = {}) {
  const map = (rows) => new Map((rows || []).map((r) => [String(r._id), r]))
  const s = map(sales)
  const ps = map(prevSales)
  const t = map(toShip)
  const l = map(live)
  const le = map(listingErrors)
  const ret = map(returns)
  const u = map(unread)
  const st = map(stockByShop)
  const sy = map(failingSyncs)

  return shops.map((shop) => {
    const id = String(shop._id)
    const autoRefresh = canAutoRefresh(shop)
    return {
      shopId: id,
      name: shop.name,
      marketplace: shop.marketplace,
      status: shop.status,
      authError: shop.authError || '',
      canRefresh: autoRefresh,
      expiresAt: autoRefresh ? null : (shop.auth?.expiresAt || null),
      lastSyncAt: shop.lastSyncAt || null,
      revenue: round(s.get(id)?.revenue),
      prevRevenue: round(ps.get(id)?.revenue),
      orders: s.get(id)?.orders || 0,
      toShip: t.get(id)?.n || 0,
      live: l.get(id)?.n || 0,
      listingErrors: le.get(id)?.n || 0,
      openReturns: ret.get(id)?.n || 0,
      unread: u.get(id)?.threads || 0,
      unreadMessages: u.get(id)?.messages || 0,
      outOfStock: st.get(id)?.outOfStock || 0,
      lowStock: st.get(id)?.lowStock || 0,
      failingSyncs: sy.get(id)?.n || 0,
      hasInbox: capability(shop.marketplace, 'inbox'),
    }
  })
}

/**
 * Shops whose login stopped working, or whose non-auto-refreshing token expires within 3 days.
 * Shops with an active refresh token renew short-lived access tokens automatically on use.
 */
function loginProblems(shops, now) {
  const out = []
  for (const shop of shops) {
    const base = { shopId: String(shop._id), name: shop.name, marketplace: shop.marketplace }
    if (shop.status === 'error') {
      out.push({ ...base, problem: 'login stopped working' })
    } else if (shop.status === 'connected' && shop.auth?.expiresAt && !canAutoRefresh(shop)) {
      const left = new Date(shop.auth.expiresAt).getTime() - now.getTime()
      if (left < 3 * DAY) {
        const days = Math.max(0, Math.ceil(left / DAY))
        out.push({ ...base, problem: left <= 0 ? 'login expired' : `login expires in ${days} day${days === 1 ? '' : 's'}` })
      }
    }
  }
  return out
}

/** Sync streams whose latest run in the last 24h failed (resolved once a newer run succeeds). */
async function failingSyncStreams(shopIds, sinceDay) {
  if (!shopIds.length) return []
  return SyncLog.aggregate([
    { $match: { shopId: { $in: shopIds }, startedAt: { $gte: sinceDay } } },
    { $sort: { startedAt: -1 } },
    { $group: { _id: { shopId: '$shopId', type: '$type' }, status: { $first: '$status' } } },
    { $match: { status: 'failed' } },
  ])
}

/** Per-shop out-of-stock / low-stock counts across products listed on each shop. */
function aggregateStockByShop(listings, lowProducts) {
  const levelByProduct = new Map(lowProducts.map((p) => [String(p._id), Number(p.stock) <= 0 ? 'out' : 'low']))
  const seenPerShop = new Map()
  for (const row of listings || []) {
    const level = levelByProduct.get(String(row.productId))
    if (!level) continue
    const shopId = String(row.shopId)
    let entry = seenPerShop.get(shopId)
    if (!entry) {
      entry = { out: new Set(), low: new Set() }
      seenPerShop.set(shopId, entry)
    }
    entry[level].add(String(row.productId))
  }
  return Array.from(seenPerShop.entries()).map(([id, entry]) => ({
    _id: id,
    outOfStock: entry.out.size,
    lowStock: entry.low.size,
  }))
}

/**
 * @param scope { orderFilter, listingFilter, conversationFilter, shopScope, productFilter, now }
 */
async function overviewExtras({ orderFilter = {}, listingFilter = {}, conversationFilter = {}, shopScope = {}, productFilter = {}, now = new Date() }) {
  const since = new Date(now.getTime() - 30 * DAY)
  const before = new Date(now.getTime() - 60 * DAY)
  const sinceDay = new Date(now.getTime() - DAY)
  const errors = {}
  const part = async (name, fn) => {
    try {
      return await fn()
    } catch (err) {
      errors[name] = err.message || 'failed'
      return null
    }
  }
  const sold = { ...orderFilter, status: { $nin: NOT_SOLD } }
  const sum = async (from, to) => {
    const [row] = await Order.aggregate([
      { $match: { ...sold, placedAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } },
    ])
    return { revenue: round(row?.revenue), orders: row?.orders || 0 }
  }

  const shops = await part('shops', () => Shop.find(shopScope).select('name marketplace status authError auth.expiresAt +auth.refreshTokenEnc lastSyncAt').lean())
  const shopIds = (shops || []).map((s) => s._id)

  const [previous, current, daily, byShop, attention, toShipNext, topProducts, unreadThreads, stockAlerts] = await Promise.all([
    part('previous', async () => {
      const [money, orders] = await Promise.all([sum(before, since), Order.countDocuments({ ...orderFilter, placedAt: { $gte: before, $lt: since } })])
      return {
        revenue: money.revenue,
        soldOrders: money.orders,
        orders,
        avgOrder: money.orders ? round(money.revenue / money.orders) : 0,
      }
    }),
    part('current', () => sum(since, now)),
    part('daily', async () => dailySeries(await Order.aggregate([
      { $match: { ...sold, placedAt: { $gte: since } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } }, marketplace: '$marketplace' }, revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } },
    ]), now)),
    part('byShop', async () => {
      if (!shops) throw new Error(errors.shops)
      const [sales, prevSales, toShip, live, listingErrors, returns, unread, listingsForStock, lowProducts, failedStreams] = await Promise.all([
        Order.aggregate([{ $match: { ...sold, placedAt: { $gte: since } } }, { $group: { _id: '$shopId', revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } }]),
        Order.aggregate([{ $match: { ...sold, placedAt: { $gte: before, $lt: since } } }, { $group: { _id: '$shopId', revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } }]),
        Order.aggregate([{ $match: { ...orderFilter, status: { $in: TO_SHIP } } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
        Listing.aggregate([{ $match: { ...listingFilter, status: 'live' } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
        Listing.aggregate([{ $match: { ...listingFilter, status: 'error' } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
        Order.aggregate([{ $match: { ...orderFilter, ...OPEN_RETURNS_MATCH } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
        Conversation.aggregate([
          { $match: { ...conversationFilter, ...UNREAD_BUYER_MATCH } },
          { $group: { _id: '$shopId', threads: { $sum: 1 }, messages: { $sum: '$unreadCount' } } },
        ]),
        Listing.find(listingFilter).select('shopId productId').lean(),
        Product.find({ ...productFilter, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).select('stock').lean(),
        failingSyncStreams(shopIds, sinceDay),
      ])
      const failingMap = new Map()
      for (const row of failedStreams || []) {
        const key = String(row._id?.shopId || '')
        failingMap.set(key, (failingMap.get(key) || 0) + 1)
      }
      const failingSyncs = Array.from(failingMap.entries()).map(([_id, n]) => ({ _id, n }))
      const stockByShop = aggregateStockByShop(listingsForStock, lowProducts || [])
      return shopCards(shops, { sales, prevSales, toShip, live, listingErrors, returns, unread, stockByShop, failingSyncs })
    }),
    part('attention', async () => {
      const [late, openReturns, listingErrors, failedStreams, outOfStock, unreadAgg] = await Promise.all([
        Order.countDocuments({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': { $lt: now } }),
        Order.countDocuments({ ...orderFilter, ...OPEN_RETURNS_MATCH }),
        Listing.countDocuments({ ...listingFilter, status: 'error' }),
        // Unknown (null) when the shop list itself failed.
        shops ? failingSyncStreams(shopIds, sinceDay) : Promise.resolve(null),
        Product.countDocuments({ ...productFilter, stock: { $lte: 0 } }),
        Conversation.aggregate([
          { $match: { ...conversationFilter, ...UNREAD_BUYER_MATCH } },
          { $group: { _id: null, messages: { $sum: '$unreadCount' } } },
        ]),
      ])
      return {
        late,
        openReturns,
        listingErrors,
        syncFailed24h: failedStreams ? failedStreams.length : null,
        outOfStock,
        unreadMessages: unreadAgg?.[0]?.messages || 0,
        loginProblems: loginProblems(shops || [], now),
      }
    }),
    part('toShipNext', async () => {
      const fields = 'externalOrderId marketplace shopId status placedAt shipping.shipBy totals.total buyer.name items'
      const dated = await Order.find({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': { $ne: null } }).sort({ 'shipping.shipBy': 1 }).limit(6).select(fields).lean()
      const rest = dated.length < 6
        ? await Order.find({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': null }).sort({ placedAt: 1 }).limit(6 - dated.length).select(fields).lean()
        : []
      return [...dated, ...rest].map((o) => ({
        id: String(o._id),
        externalOrderId: o.externalOrderId,
        marketplace: o.marketplace,
        shopId: String(o.shopId),
        status: o.status,
        placedAt: o.placedAt || null,
        shipBy: o.shipping?.shipBy || null,
        total: o.totals?.total ?? null,
        buyer: decrypt(o.buyer?.name || '') || '',
        itemsCount: (o.items || []).reduce((n, it) => n + (Number(it.quantity) || 0), 0),
      }))
    }),
    part('topProducts', async () => {
      const rows = await Order.aggregate([
        { $match: { ...sold, placedAt: { $gte: since } } },
        { $unwind: '$items' },
        { $group: { _id: { $ifNull: ['$items.productId', '$items.title'] }, title: { $first: '$items.title' }, marketplace: { $first: '$marketplace' }, revenue: { $sum: { $multiply: [{ $ifNull: ['$items.unitPrice', 0] }, '$items.quantity'] } }, units: { $sum: '$items.quantity' } } },
        { $sort: { revenue: -1, units: -1 } },
        { $limit: 6 },
      ])
      const ids = rows.map((r) => r._id).filter((id) => id && typeof id === 'object')
      const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('title marketplace').lean() : []
      const byId = new Map(products.map((p) => [String(p._id), p]))
      return rows.map((r) => {
        const prod = byId.get(String(r._id))
        return {
          productId: r._id && typeof r._id === 'object' ? String(r._id) : null,
          title: prod?.title || r.title || 'Product',
          marketplace: prod?.marketplace || r.marketplace || null,
          revenue: round(r.revenue),
          units: r.units || 0,
        }
      })
    }),
    part('unreadThreads', async () => {
      const rows = await Conversation.find({ ...conversationFilter, ...UNREAD_BUYER_MATCH })
        .sort({ lastMessageAt: -1 })
        .limit(5)
        .select('shopId marketplace customerName lastMessagePreview unreadCount lastMessageAt')
        .lean()
      return rows.map((c) => ({
        id: String(c._id),
        shopId: String(c.shopId),
        marketplace: c.marketplace || null,
        customerName: c.customerName || 'Buyer',
        preview: c.lastMessagePreview || '',
        unreadCount: c.unreadCount || 0,
        lastMessageAt: c.lastMessageAt || null,
      }))
    }),
    part('stockAlerts', async () => {
      const rows = await Product.find({ ...productFilter, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
        .sort({ stock: 1, updatedAt: -1 })
        .limit(5)
        .select('sku title marketplace stock lowStockThreshold')
        .lean()
      return rows.map((p) => ({
        id: String(p._id),
        sku: p.sku || '',
        title: p.title || 'Product',
        marketplace: p.marketplace || null,
        stock: Number(p.stock) || 0,
        threshold: Number(p.lowStockThreshold) || 0,
      }))
    }),
  ])

  return {
    previous,
    soldOrders30: current ? current.orders : null,
    // Per order that wasn't cancelled or refunded.
    avgOrder: current && current.orders ? round(current.revenue / current.orders) : current ? 0 : null,
    daily,
    byShop,
    attention,
    toShipNext,
    topProducts,
    unreadThreads,
    stockAlerts,
    errors,
  }
}

module.exports = { overviewExtras, dailySeries, shopCards, loginProblems }
