/** Analytics: totals from this shop's orders. */
const Order = require('../../../../models/Order')
const Product = require('../../../../models/Product')
const Listing = require('../../../../models/Listing')
const { shopFilter } = require('../../../../middleware/auth')

/** Milliseconds `tz` is ahead of UTC at instant `t`. */
function zoneOffset(t, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map((p) => [p.type, p.value]))
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - t
}

/** The instant a calendar day starts in `tz` (summer time included). */
function dayStart(day, tz) {
  const t = Date.parse(`${day}T00:00:00Z`)
  return new Date(t - zoneOffset(t - zoneOffset(t, tz), tz))
}

const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

function dates(req) {
  const plain = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
  // Plain calendar days with a time zone are that zone's whole days (eBay US counts days in Pacific time).
  if (plain(req.query.from) && plain(req.query.to) && req.query.tz && viewerZone(req.query.tz) !== 'UTC') {
    const tz = viewerZone(req.query.tz)
    return { from: dayStart(req.query.from, tz), to: new Date(dayStart(nextDay(req.query.to), tz).getTime() - 1) }
  }
  // A plain calendar day ("2026-11-23") as `to` counts in full.
  const plainDay = plain(req.query.to)
  const to = req.query.to ? new Date(plainDay ? `${req.query.to}T23:59:59.999Z` : req.query.to) : new Date()
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 29 * 86400000)
  return { from, to }
}

function match(req, extra = {}) {
  const m = { ...shopFilter(req, Order), ...extra }
  const { from, to } = dates(req)
  m.placedAt = { $gte: from, $lte: to }
  return m
}

/** This shop's orders only. */
const marketplaceFilter = () => ({ marketplace: 'ebay' })

/** Daily `{ date, revenue, orders, items }` from the shop's own analytics API. */

async function orderProfitAndStatus(req) {
  const m = match(req, marketplaceFilter(req))
  const activeMatch = { ...m, status: { $nin: ['cancelled', 'refunded'] } }
  const [byStatus, [profitAgg]] = await Promise.all([
    Order.aggregate([
      { $match: m },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: activeMatch },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'products',
          let: { productId: '$items.productId', sku: '$items.sku' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ['$$productId', null] }, { $eq: ['$_id', '$$productId'] }] },
                    { $and: [{ $ne: ['$$sku', null] }, { $eq: ['$sku', '$$sku'] }] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          profit: {
            $sum: {
              $multiply: [
                { $ifNull: ['$items.quantity', 0] },
                {
                  $subtract: [
                    { $ifNull: ['$items.unitPrice', { $ifNull: ['$product.basePrice', 0] }] },
                    { $ifNull: ['$product.costPrice', 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
  ])
  return {
    activeMatch,
    profit: +((profitAgg?.profit) || 0).toFixed(2),
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
  }
}

/** GET /summary */
async function summary(ctx) {
    const { activeMatch, profit, byStatus } = await orderProfitAndStatus(ctx)
    const [agg] = await Order.aggregate([
      { $match: activeMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
          items: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ])
    return {
      revenue: +(agg?.revenue || 0).toFixed(2),
      orders: agg?.orders || 0,
      items: agg?.items || 0,
      avgOrder: agg?.orders ? +((agg.revenue || 0) / agg.orders).toFixed(2) : 0,
      profit,
      byStatus,
    }
}

/** The viewer's IANA time zone when valid, else UTC: days are grouped in it. */
function viewerZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** GET /revenue */
async function revenue(ctx) {
    const extra = { ...marketplaceFilter(ctx), status: { $nin: ['cancelled', 'refunded'] } }
    const rows = await Order.aggregate([
      { $match: match(ctx, extra) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt', timezone: viewerZone(ctx.query.tz) } },
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    return rows.map((r) => ({ date: r._id, revenue: +r.revenue.toFixed(2), orders: r.orders }))
}

/** GET /marketplaces */
async function marketplaces(ctx) {
    const rows = await Order.aggregate([
      { $match: match(ctx, { ...marketplaceFilter(ctx), status: { $nin: ['cancelled', 'refunded'] } }) },
      {
        $group: {
          _id: '$marketplace',
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    return rows.map((r) => ({ marketplace: r._id, revenue: +r.revenue.toFixed(2), orders: r.orders }))
}

/** GET /products */
async function products(ctx) {
    const limit = Math.min(20, Number(ctx.query.limit) || 10)
    const rows = await Order.aggregate([
      { $match: match(ctx, { ...marketplaceFilter(ctx), status: { $nin: ['cancelled', 'refunded'] } }) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          sku: { $first: '$items.sku' },
          title: { $first: '$items.title' },
          qty: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    return rows.map((r) => ({
      productId: r._id, sku: r.sku, title: r.title, qty: r.qty, revenue: +r.revenue.toFixed(2),
    }))
}

/** GET /inventory */
async function inventory(ctx) {
    const filter = { $expr: { $lte: ['$stock', '$lowStockThreshold'] } }
    const marketplace = 'ebay'
    const listingFilter = {}
    if (ctx.user.role === 'sub_admin') listingFilter.shopId = { $in: ctx.allowedShopIds }
    if (marketplace) listingFilter.marketplace = marketplace
    if (Object.keys(listingFilter).length) {
      filter._id = { $in: await Listing.find(listingFilter).distinct('productId') }
    }
    filter.marketplace = 'ebay'
    const low = await Product.find(filter)
      .select('sku title stock lowStockThreshold')
      .sort({ stock: 1 })
    const out = await Product.countDocuments({ ...filter, stock: 0 })
    return { lowCount: low.length, outCount: out, low }
}

/**
 * GET /traffic?from=YYYY-MM-DD&to=YYYY-MM-DD — eBay's traffic report by day for the page's tiles
 * and chart: `{ latestDate, days: [{ date, impressions, views, sold }] }`.
 */
async function traffic(ctx) {
    const { HttpError } = require('../../../../utils/httpError')
    const Shop = require('../../../../models/Shop')
    const filter = { marketplace: 'ebay', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: 'No connected eBay shop' })
    const day = /^\d{4}-\d{2}-\d{2}$/
    const from = String(ctx.query.from || '')
    const to = String(ctx.query.to || '')
    if (!day.test(from) || !day.test(to)) throw new HttpError(400, { error: 'from and to must be YYYY-MM-DD' })
    const marketplaceManager = require('../manager')
    const { dailyTraffic } = require('../../sections/analytics')
    try {
      return await marketplaceManager.withShopToken(shop, (token) => dailyTraffic(token, from, to))
    } catch (err) {
      const denied = err?.status === 401 || err?.status === 403 || /insufficient|scope|permission/i.test(err?.message || '')
      throw new HttpError(502, { error: denied ? 'Reconnect eBay in Settings to allow listing traffic.' : err.message, ...(denied ? { reconnect: true } : {}) })
    }
}

/**
 * GET /listing-traffic — each listing's 30-day impressions and views for the Listings page, cached
 * 10 minutes per shop. A refused report gives `{ rows: [], unavailable: true }` (views just don't show).
 */
async function listingTraffic(ctx) {
    const { HttpError } = require('../../../../utils/httpError')
    const Shop = require('../../../../models/Shop')
    const cache = require('../../../../services/core/cache')
    const filter = { marketplace: 'ebay', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: 'No connected eBay shop' })
    const key = `shop:${shop._id}:listing-traffic`
    const hit = await cache.get(key)
    if (hit !== undefined && hit !== null) return hit
    const marketplaceManager = require('../manager')
    const { listingTraffic: load } = require('../../sections/analytics')
    try {
      const rows = await marketplaceManager.withShopToken(shop, (token) => load(token))
      const out = { rows: rows.map(({ listingId, impressions, views }) => ({ listingId, impressions, views })) }
      await cache.set(key, out, 600)
      return out
    } catch (err) {
      const denied = err?.status === 401 || err?.status === 403 || /insufficient|scope|permission/i.test(err?.message || '')
      if (denied) return { rows: [], unavailable: true }
      throw new HttpError(502, { error: err.message })
    }
}

module.exports = { summary, revenue, marketplaces, products, inventory, traffic, listingTraffic }
