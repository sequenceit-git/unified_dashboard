/** Generated from routes/analytics/analytics.js: business logic behind the routes; routes only handle HTTP. */
const Order = require('../../models/Order')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const Shop = require('../../models/Shop')
const tiktok = require('../../marketplaces/tiktok_shop/service')
const marketplaceManager = require('../../services/marketplace')
const { canonical: canonicalMarketplace } = require('../../marketplaces')
const { shopFilter, canAccessShop } = require('../../middleware/auth')

function dates(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date()
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 29 * 86400000)
  return { from, to }
}

function match(req, extra = {}) {
  const m = { ...shopFilter(req, Order), ...extra }
  const { from, to } = dates(req)
  m.placedAt = { $gte: from, $lte: to }
  return m
}

function marketplaceFilter(req) {
  const marketplace = canonicalMarketplace(req.query.marketplace)
  return marketplace ? { marketplace } : {}
}

function money(value) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  if (value.overall) return money(value.overall)
  return Number(value.amount || 0)
}

async function tiktokShop(req) {
  if (canonicalMarketplace(req.query.marketplace) !== 'tiktok_shop') return null
  const shop = await Shop.findOne({ marketplace: 'tiktok_shop', status: 'connected' })
  // Sub-admins only get TikTok's own figures when the shop is one of theirs (for analytics).
  if (!shop || !canAccessShop(req, shop._id)) return null
  return shop
}

async function tiktokIntervals(shop, req) {
  const { from, to } = dates(req)
  return marketplaceManager.withShopToken(shop, (token) => tiktok.shopPerformance(token, { shop, from, to }))
}

function intervalSales(interval) {
  const sales = interval?.sales || {}
  return {
    date: interval.start_date || interval.end_date,
    revenue: +money(sales.gmv).toFixed(2),
    orders: Number(sales.orders_count || 0),
    items: Number(sales.items_sold || 0),
  }
}

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
    const shop = await tiktokShop(ctx)
    if (shop) {
      try {
        const rows = (await tiktokIntervals(shop, ctx)).map(intervalSales)
        const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
        const orders = rows.reduce((sum, row) => sum + row.orders, 0)
        const items = rows.reduce((sum, row) => sum + row.items, 0)
        const { profit, byStatus } = await orderProfitAndStatus(ctx)
        return {
          revenue: +revenue.toFixed(2),
          orders,
          items,
          avgOrder: orders ? +(revenue / orders).toFixed(2) : 0,
          profit,
          byStatus,
        }
      } catch (error) {
        console.warn('[analytics] TikTok summary failed:', error.message)
      }
    }
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

/** GET /revenue */
async function revenue(ctx) {
    const shop = await tiktokShop(ctx)
    if (shop) {
      try {
        return (await tiktokIntervals(shop, ctx)).map(intervalSales)
      } catch (error) {
        console.warn('[analytics] TikTok revenue failed:', error.message)
      }
    }
    const extra = { ...marketplaceFilter(ctx), status: { $nin: ['cancelled', 'refunded'] } }
    const rows = await Order.aggregate([
      { $match: match(ctx, extra) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
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
    const shop = await tiktokShop(ctx)
    if (shop) {
      try {
        const rows = (await tiktokIntervals(shop, ctx)).map(intervalSales)
        return [{
          marketplace: 'tiktok_shop',
          revenue: +rows.reduce((sum, row) => sum + row.revenue, 0).toFixed(2),
          orders: rows.reduce((sum, row) => sum + row.orders, 0),
        }]
      } catch (error) {
        console.warn('[analytics] TikTok marketplace chart failed:', error.message)
      }
    }
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
    const shop = await tiktokShop(ctx)
    if (shop) {
      try {
        const { from, to } = dates(ctx)
        const limit = Math.min(20, Number(ctx.query.limit) || 10)
        const performance = await marketplaceManager.withShopToken(shop, (token) => tiktok.productPerformance(token, { shop, from, to, limit }))
        const listings = await Listing.find({ shopId: shop._id }).select('externalListingId productId')
        const catalog = await Product.find({ _id: { $in: listings.map((row) => row.productId) } }).select('title sku')
        const rows = performance.map((item) => {
          const id = String(item.id || item.product_id || '')
          const listing = listings.find((row) => String(row.externalListingId || '').split(':')[0] === id)
          const product = catalog.find((row) => String(row._id) === String(listing?.productId))
        const stats = item.overall_performance || item
        return {
          productId: product?._id || id,
          sku: product?.sku || id,
          title: product?.title || item.title || id,
          qty: Number(stats.items_sold || stats.units_sold || stats.orders || 0),
          revenue: +money(stats.gmv).toFixed(2),
        }
        })
        return rows
      } catch (error) {
        console.warn('[analytics] TikTok product performance failed:', error.message)
      }
    }
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
    const marketplace = canonicalMarketplace(ctx.query.marketplace)
    const listingFilter = {}
    if (ctx.user.role === 'sub_admin') listingFilter.shopId = { $in: ctx.allowedShopIds }
    if (marketplace) listingFilter.marketplace = marketplace
    if (Object.keys(listingFilter).length) {
      filter._id = { $in: await Listing.find(listingFilter).distinct('productId') }
    }
    const low = await Product.find(filter)
      .select('sku title stock lowStockThreshold')
      .sort({ stock: 1 })
    const out = await Product.countDocuments({ ...filter, stock: 0 })
    return { lowCount: low.length, outCount: out, low }
}

module.exports = { summary, revenue, marketplaces, products, inventory }
