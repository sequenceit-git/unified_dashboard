const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute, shopFilter } = require('../../middleware/auth')
const Order = require('../../models/Order')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const Shop = require('../../models/Shop')
const tiktok = require('../../services/marketplace/tiktok')
const { canonicalMarketplace } = require('../../utils/marketplace')
const { cachedResponse } = require('../../services/cache')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('analytics'), cachedResponse('analytics', 120))

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
  const shop = await Shop.findOne({ marketplace: 'tiktok_shop', status: 'connected' }).select('+auth.accessTokenEnc')
  return shop?.auth?.accessTokenEnc ? shop : null
}

async function tiktokIntervals(shop, req) {
  const { from, to } = dates(req)
  return tiktok.shopPerformance(shop.auth.accessTokenEnc, { shop, from, to })
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

// GET /api/analytics/summary?from=&to=
router.get('/summary', async (req, res) => {
  try {
    const shop = await tiktokShop(req)
    if (shop) {
      try {
        const rows = (await tiktokIntervals(shop, req)).map(intervalSales)
        const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
        const orders = rows.reduce((sum, row) => sum + row.orders, 0)
        const items = rows.reduce((sum, row) => sum + row.items, 0)
        return res.json({
          revenue: +revenue.toFixed(2),
          orders,
          items,
          avgOrder: orders ? +(revenue / orders).toFixed(2) : 0,
          profit: 0,
          byStatus: {},
        })
      } catch (error) {
        console.warn('[analytics] TikTok summary failed:', error.message)
      }
    }
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
    const shop = await tiktokShop(req)
    if (shop) {
      try {
        return res.json((await tiktokIntervals(shop, req)).map(intervalSales))
      } catch (error) {
        console.warn('[analytics] TikTok revenue failed:', error.message)
      }
    }
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
    const shop = await tiktokShop(req)
    if (shop) {
      try {
        const rows = (await tiktokIntervals(shop, req)).map(intervalSales)
        return res.json([{
          marketplace: 'tiktok_shop',
          revenue: +rows.reduce((sum, row) => sum + row.revenue, 0).toFixed(2),
          orders: rows.reduce((sum, row) => sum + row.orders, 0),
        }])
      } catch (error) {
        console.warn('[analytics] TikTok marketplace chart failed:', error.message)
      }
    }
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
    const shop = await tiktokShop(req)
    if (shop) {
      try {
        const { from, to } = dates(req)
        const limit = Math.min(20, Number(req.query.limit) || 10)
        const performance = await tiktok.productPerformance(shop.auth.accessTokenEnc, { shop, from, to, limit })
        const listings = await Listing.find({ shopId: shop._id }).select('externalListingId productId')
        const catalog = await Product.find({ _id: { $in: listings.map((row) => row.productId) } }).select('title sku')
        const rows = performance.map((item) => {
          const id = String(item.id || item.product_id || '')
          const listing = listings.find((row) => String(row.externalListingId || '').startsWith(`${id}:`))
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
        return res.json(rows)
      } catch (error) {
        console.warn('[analytics] TikTok product performance failed:', error.message)
      }
    }
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
