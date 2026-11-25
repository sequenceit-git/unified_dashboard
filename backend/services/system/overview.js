/**
 * The Overview page's extra parts: previous 30 days, daily sales per shop, one card per shop,
 * needs attention, the next orders to ship and top products. Only the dashboard's own database;
 * every query keeps the caller's shop scope. Each part fails on its own (its error is in `errors`).
 */
const Order = require('../../models/Order')
const Listing = require('../../models/Listing')
const Shop = require('../../models/Shop')
const SyncLog = require('../../models/SyncLog')
const Product = require('../../models/Product')

const DAY = 86400000
const TO_SHIP = ['pending', 'paid', 'processing']
const NOT_SOLD = ['cancelled', 'refunded']
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const dayKey = (d) => d.toISOString().slice(0, 10)

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

/** One card per visible shop, with its 30-day sales, orders to ship and live listings. */
function shopCards(shops, { sales = [], toShip = [], live = [] } = {}) {
  const map = (rows) => new Map(rows.map((r) => [String(r._id), r]))
  const s = map(sales)
  const t = map(toShip)
  const l = map(live)
  return shops.map((shop) => {
    const id = String(shop._id)
    return {
      shopId: id,
      name: shop.name,
      marketplace: shop.marketplace,
      status: shop.status,
      authError: shop.authError || '',
      expiresAt: shop.auth?.expiresAt || null,
      lastSyncAt: shop.lastSyncAt || null,
      revenue: round(s.get(id)?.revenue),
      orders: s.get(id)?.orders || 0,
      toShip: t.get(id)?.n || 0,
      live: l.get(id)?.n || 0,
    }
  })
}

/** Shops whose login stopped working, or that expires within 3 days. */
function loginProblems(shops, now) {
  const out = []
  for (const shop of shops) {
    const base = { shopId: String(shop._id), name: shop.name, marketplace: shop.marketplace }
    if (shop.status === 'error') out.push({ ...base, problem: 'login stopped working' })
    else if (shop.status === 'connected' && shop.auth?.expiresAt) {
      const left = new Date(shop.auth.expiresAt).getTime() - now.getTime()
      if (left < 3 * DAY) {
        const days = Math.max(0, Math.ceil(left / DAY))
        out.push({ ...base, problem: left <= 0 ? 'login expired' : `login expires in ${days} day${days === 1 ? '' : 's'}` })
      }
    }
  }
  return out
}

/**
 * @param scope { orderFilter, listingFilter, shopScope, productFilter, now }
 */
async function overviewExtras({ orderFilter = {}, listingFilter = {}, shopScope = {}, productFilter = {}, now = new Date() }) {
  const since = new Date(now.getTime() - 30 * DAY)
  const before = new Date(now.getTime() - 60 * DAY)
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

  const shops = await part('shops', () => Shop.find(shopScope).select('name marketplace status authError auth.expiresAt lastSyncAt').lean())
  const shopIds = (shops || []).map((s) => s._id)

  const [previous, current, daily, byShop, attention, toShipNext, topProducts] = await Promise.all([
    // Defined like the page's own 30-day numbers: revenue without cancelled/refunded, orders of every status.
    part('previous', async () => {
      const [money, orders] = await Promise.all([sum(before, since), Order.countDocuments({ ...orderFilter, placedAt: { $gte: before, $lt: since } })])
      return { revenue: money.revenue, orders }
    }),
    part('current', () => sum(since, now)),
    part('daily', async () => dailySeries(await Order.aggregate([
      { $match: { ...sold, placedAt: { $gte: since } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } }, marketplace: '$marketplace' }, revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } },
    ]), now)),
    part('byShop', async () => {
      if (!shops) throw new Error(errors.shops)
      const [sales, toShip, live] = await Promise.all([
        Order.aggregate([{ $match: { ...sold, placedAt: { $gte: since } } }, { $group: { _id: '$shopId', revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } }]),
        Order.aggregate([{ $match: { ...orderFilter, status: { $in: TO_SHIP } } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
        Listing.aggregate([{ $match: { ...listingFilter, status: 'live' } }, { $group: { _id: '$shopId', n: { $sum: 1 } } }]),
      ])
      return shopCards(shops, { sales, toShip, live })
    }),
    part('attention', async () => {
      const [late, syncFailed24h, outOfStock] = await Promise.all([
        Order.countDocuments({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': { $lt: now } }),
        // Unknown (null) when the shop list itself failed.
        shops ? SyncLog.countDocuments({ shopId: { $in: shopIds }, status: 'failed', startedAt: { $gte: new Date(now.getTime() - DAY) } }) : null,
        Product.countDocuments({ ...productFilter, stock: { $lte: 0 } }),
      ])
      return { late, syncFailed24h, outOfStock, loginProblems: loginProblems(shops || [], now) }
    }),
    part('toShipNext', async () => {
      const fields = 'externalOrderId marketplace shopId status placedAt shipping.shipBy totals.total buyer.name'
      const dated = await Order.find({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': { $ne: null } }).sort({ 'shipping.shipBy': 1 }).limit(5).select(fields).lean()
      const rest = dated.length < 5
        ? await Order.find({ ...orderFilter, status: { $in: TO_SHIP }, 'shipping.shipBy': null }).sort({ placedAt: 1 }).limit(5 - dated.length).select(fields).lean()
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
        buyer: o.buyer?.name || '',
      }))
    }),
    part('topProducts', async () => {
      const rows = await Order.aggregate([
        { $match: { ...sold, placedAt: { $gte: since } } },
        { $unwind: '$items' },
        { $group: { _id: { $ifNull: ['$items.productId', '$items.title'] }, title: { $first: '$items.title' }, revenue: { $sum: { $multiply: [{ $ifNull: ['$items.unitPrice', 0] }, '$items.quantity'] } }, units: { $sum: '$items.quantity' } } },
        { $sort: { revenue: -1, units: -1 } },
        { $limit: 5 },
      ])
      const ids = rows.map((r) => r._id).filter((id) => id && typeof id === 'object')
      const titles = new Map((ids.length ? await Product.find({ _id: { $in: ids } }).select('title').lean() : []).map((p) => [String(p._id), p.title]))
      return rows.map((r) => ({ productId: r._id && typeof r._id === 'object' ? String(r._id) : null, title: titles.get(String(r._id)) || r.title || 'Product', revenue: round(r.revenue), units: r.units || 0 }))
    }),
  ])

  return {
    previous,
    // Per order that wasn't cancelled or refunded.
    avgOrder: current && current.orders ? round(current.revenue / current.orders) : current ? 0 : null,
    daily,
    byShop,
    attention,
    toShipNext,
    topProducts,
    errors,
  }
}

module.exports = { overviewExtras, dailySeries, shopCards, loginProblems }
