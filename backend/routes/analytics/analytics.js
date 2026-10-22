const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute, shopFilter } = require('../../middleware/auth')
const Order = require('../../models/Order')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const { canonicalMarketplace } = require('../../utils/marketplace')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('analytics'))

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

// GET /api/analytics/summary?from=&to=
router.get('/summary', async (req, res) => {
  try {
    const m = match(req, marketplaceFilter(req))
    const [agg] = await Order.aggregate([
      { $match: m },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
          items: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ])
    const byStatus = await Order.aggregate([
      { $match: m },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    const [profitAgg] = await Order.aggregate([
      { $match: m },
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
    ])
    res.json({
      revenue: +(agg?.revenue || 0).toFixed(2),
      orders: agg?.orders || 0,
      items: agg?.items || 0,
      avgOrder: agg?.orders ? +((agg.revenue || 0) / agg.orders).toFixed(2) : 0,
      profit: +((profitAgg?.profit) || 0).toFixed(2),
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/revenue?from=&to=&marketplace=
router.get('/revenue', async (req, res) => {
  try {
    const extra = marketplaceFilter(req)
    const rows = await Order.aggregate([
      { $match: match(req, extra) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    res.json(rows.map((r) => ({ date: r._id, revenue: +r.revenue.toFixed(2), orders: r.orders })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/marketplaces?from=&to=
router.get('/marketplaces', async (req, res) => {
  try {
    const rows = await Order.aggregate([
      { $match: match(req, marketplaceFilter(req)) },
      {
        $group: {
          _id: '$marketplace',
          revenue: { $sum: '$totals.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    res.json(rows.map((r) => ({ marketplace: r._id, revenue: +r.revenue.toFixed(2), orders: r.orders })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/products?from=&to=&limit=
router.get('/products', async (req, res) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10)
    const rows = await Order.aggregate([
      { $match: match(req, marketplaceFilter(req)) },
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
    res.json(rows.map((r) => ({
      productId: r._id, sku: r.sku, title: r.title, qty: r.qty, revenue: +r.revenue.toFixed(2),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/analytics/inventory — low/out-of-stock snapshot
router.get('/inventory', async (req, res) => {
  try {
    const filter = { $expr: { $lte: ['$stock', '$lowStockThreshold'] } }
    const marketplace = canonicalMarketplace(req.query.marketplace)
    const listingFilter = {}
    if (req.user.role === 'sub_admin') listingFilter.shopId = { $in: req.allowedShopIds }
    if (marketplace) listingFilter.marketplace = marketplace
    if (Object.keys(listingFilter).length) {
      filter._id = { $in: await Listing.find(listingFilter).distinct('productId') }
    }
    const low = await Product.find(filter)
      .select('sku title stock lowStockThreshold')
      .sort({ stock: 1 })
    const out = await Product.countDocuments({ ...filter, stock: 0 })
    res.json({ lowCount: low.length, outCount: out, low })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
