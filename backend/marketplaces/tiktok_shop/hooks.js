/**
 * TikTok Shop steps inside the shared sync (services/marketplace): reading orders with their
 * returns and cancellations, and which listing images can be sent. The core calls these through
 * `adapter.hooks`; it never checks for TikTok Shop by name.
 */
const Order = require('../../models/Order')
const Listing = require('../../models/Listing')

/** TikTok takes public URLs, uploaded files and data URLs as they are. */
function listingImages(manager, rawImages) {
  return rawImages.map((url) => String(url || '').trim()).filter((url) => /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(url))
}

async function fetchOrders(manager, shop, token, service) {
  let rawOrders = []
  let complete = true
    const OVERLAP_MS = 60 * 60 * 1000
    const since = shop.ordersSyncedAt ? new Date(new Date(shop.ordersSyncedAt).getTime() - OVERLAP_MS) : null
    const [res, rawReturns, rawCancellations] = await Promise.all([
      service.getOrders(token, { limit: 1000, since, shop }),
      typeof service.getReturns === 'function' ? service.getReturns(token, { shop }).catch(() => []) : [],
      typeof service.getCancellations === 'function' ? service.getCancellations(token, { shop }).catch(() => []) : [],
    ])

    const cancelledOrderIds = new Set()
    for (const c of rawCancellations || []) {
      const cStatus = String(c.cancel_status || '').toUpperCase()
      if (['CANCELLATION_REQUEST_COMPLETE', 'CANCELLATION_REQUEST_SUCCESS'].includes(cStatus) && c.order_id) {
        cancelledOrderIds.add(String(c.order_id))
      }
    }

    const returnedOrderMap = new Map()
    for (const r of rawReturns || []) {
      if (!r.order_id) continue
      const id = String(r.order_id)
      if (!returnedOrderMap.has(id)) returnedOrderMap.set(id, [])
      returnedOrderMap.get(id).push(r)
    }

    rawOrders = res.orders || []
    if (typeof service.getOrderDetails === 'function') {
      const fetchedIds = new Set(rawOrders.map((o) => String(o.externalOrderId || '')).filter(Boolean))
      const affectedIds = [...new Set([...cancelledOrderIds, ...returnedOrderMap.keys()])].filter((id) => id && !fetchedIds.has(id))
      if (affectedIds.length) {
        const staleRows = await Order.find({
          shopId: shop._id,
          externalOrderId: { $in: affectedIds },
          status: { $nin: ['cancelled', 'refunded'] },
        }).select('externalOrderId').limit(20).lean()
        const missingIds = staleRows.map((row) => row.externalOrderId).filter(Boolean)
        if (missingIds.length) {
          const extraOrders = await service.getOrderDetails(token, missingIds, { shop }).catch(() => [])
          if (extraOrders?.length) rawOrders.push(...extraOrders)
        }
      }
    }

    const COMPLETE_RETURN = new Set([
      'RETURN_OR_REFUND_REQUEST_COMPLETE',
      'RETURN_OR_REFUND_REQUEST_SUCCESS',
      'REPLACEMENT_REQUEST_REFUND_SUCCESS',
    ])
    const REJECTED_RETURN = new Set([
      'REFUND_OR_RETURN_REQUEST_REJECT',
      'REJECT_RECEIVE_PACKAGE',
      'RETURN_OR_REFUND_REQUEST_CANCEL',
      'REPLACEMENT_REQUEST_REJECT',
      'REPLACEMENT_REQUEST_CANCEL',
    ])
    const APPROVED_RETURN = new Set(['AWAITING_BUYER_SHIP', 'BUYER_SHIPPED_ITEM'])

    for (const ord of rawOrders) {
      const extId = String(ord.externalOrderId || '')
      const rets = returnedOrderMap.get(extId) || []
      if (rets.length) {
        ord.returns = rets.map((r) => {
          const st = String(r.return_status || '').toUpperCase()
          const refundAmt = Number(r.refund_amount?.refund_total || 0)
          const mappedStatus = (COMPLETE_RETURN.has(st) || st === 'REPLACEMENT_REQUEST_COMPLETE')
            ? 'received'
            : REJECTED_RETURN.has(st)
              ? 'rejected'
              : APPROVED_RETURN.has(st)
                ? 'approved'
                : 'requested'
          return {
            reason: r.return_reason_text || r.return_reason || 'Customer return',
            status: mappedStatus,
            refundAmount: refundAmt > 0 ? refundAmt : undefined,
            requestedAt: r.create_time ? new Date(Number(r.create_time) * 1000) : undefined,
            refundedAt: (COMPLETE_RETURN.has(st) || st === 'REPLACEMENT_REQUEST_COMPLETE')
              ? new Date(Number(r.update_time || r.create_time || Date.now() / 1000) * 1000)
              : undefined,
          }
        })
        if (rets.some((r) => COMPLETE_RETURN.has(String(r.return_status || '').toUpperCase()))) {
          ord.status = 'refunded'
        } else if (rets.some((r) => !REJECTED_RETURN.has(String(r.return_status || '').toUpperCase()))) {
          ord.status = 'returned'
        }
      }
      if (cancelledOrderIds.has(extId) && ord.status !== 'refunded') {
        ord.status = 'cancelled'
      }
    }
    complete = res.complete !== false
  return { rawOrders, complete }
}

/** No listings chosen: the promotion covers every live product (TikTok takes product IDs). */
async function promotionTargets(manager, shop, listingIds) {
  if (listingIds.length) return { listingIds }
  const liveListings = await Listing.find({
    shopId: shop._id,
    status: 'live',
    externalListingId: { $exists: true, $nin: ['', null] },
  }).select('externalListingId').limit(300).lean()
  const finalListingIds = [...new Set(
    liveListings.map((row) => String(row.externalListingId || '').split(':')[0]).filter(Boolean),
  )].slice(0, 300)
  return { listingIds: finalListingIds }
}


/** TikTok money: a number, string or { amount } / { overall: ... } object. */
function money(value) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  if (value.overall) return money(value.overall)
  return Number(value.amount || 0)
}

/** One TikTok shop-performance interval as { date, revenue, orders, items }. */
function intervalSales(interval) {
  const sales = interval?.sales || {}
  return {
    date: interval.start_date || interval.end_date,
    revenue: +money(sales.gmv).toFixed(2),
    orders: Number(sales.orders_count || 0),
    items: Number(sales.items_sold || 0),
  }
}

const CHANNELS = { VIDEO: 'video', LIVE: 'live', PRODUCT_CARD: 'productCard' }
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** One TikTok day: sales, where they came from (video / LIVE / product card) and traffic; missing parts are null. */
function dayPerformance(interval) {
  const sales = interval?.sales || {}
  const traffic = interval?.traffic || null
  const breakdowns = sales.gmv?.breakdowns
  let channels = null
  if (Array.isArray(breakdowns) && breakdowns.length) {
    channels = { video: 0, live: 0, productCard: 0 }
    for (const b of breakdowns) if (CHANNELS[b.type]) channels[CHANNELS[b.type]] = +money(b.gmv).toFixed(2)
  }
  return {
    date: interval.start_date || interval.end_date,
    gmv: +money(sales.gmv).toFixed(2),
    orders: Number(sales.orders_count || 0),
    items: Number(sales.items_sold || 0),
    refunds: sales.refunds ? +money(sales.refunds).toFixed(2) : null,
    customers: num(sales.avg_customers_count),
    pageViews: traffic ? num(traffic.avg_page_views) : null,
    visitors: traffic ? num(traffic.avg_visitors) : null,
    conversion: traffic ? num(traffic.avg_conversation_rate) : null,
    channels,
  }
}

/** TikTok's own figures for Analytics (Data Analytics API), used instead of the order totals. */
const analytics = {
  /** `{ latestDate, days }`: every daily figure TikTok gives for the page (see dayPerformance). */
  async dailyPerformance(manager, shop, { from, to }) {
    const service = require('./service')
    const { intervals, latestDate } = await manager.withShopToken(shop, (token) => service.shopPerformanceData(token, { shop, from, to }))
    return { latestDate, days: intervals.map(dayPerformance) }
  },
  async salesIntervals(manager, shop, { from, to }) {
    const service = require('./service')
    const intervals = await manager.withShopToken(shop, (token) => service.shopPerformance(token, { shop, from, to }))
    return intervals.map(intervalSales)
  },
  /** Best sellers as { id (product id), title, qty, revenue }. */
  async productPerformance(manager, shop, { from, to, limit }) {
    const service = require('./service')
    const performance = await manager.withShopToken(shop, (token) => service.productPerformance(token, { shop, from, to, limit }))
    return performance.map((item) => {
      const id = String(item.id || item.product_id || '')
      const stats = item.overall_performance || item
      return {
        id,
        title: item.title || id,
        qty: Number(stats.items_sold || stats.units_sold || stats.orders || 0),
        revenue: +money(stats.gmv).toFixed(2),
      }
    })
  },
}

module.exports = { listingImages, fetchOrders, promotionTargets, analytics, dayPerformance }
