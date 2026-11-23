/** Analytics: totals from this shop's orders. */
const Order = require('../../../../models/Order')
const Product = require('../../../../models/Product')
const Listing = require('../../../../models/Listing')
const { shopFilter } = require('../../../../middleware/auth')

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

/** GET /revenue */
async function revenue(ctx) {
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
    const low = await Product.find(filter)
      .select('sku title stock lowStockThreshold')
      .sort({ stock: 1 })
    const out = await Product.countDocuments({ ...filter, stock: 0 })
    return { lowCount: low.length, outCount: out, low }
}

module.exports = { summary, revenue, marketplaces, products, inventory }
