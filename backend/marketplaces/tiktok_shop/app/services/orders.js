/** Generated from routes/sales/orders.js: business logic behind the routes; routes only handle HTTP. */
const { paging, sortOf, paged } = require('../../../../utils/query')
const Order = require('../../../../models/Order')
const Shop = require('../../../../models/Shop')
const marketplaceManager = require('../manager')
const syncQueue = require('../../../../services/core/syncQueue')
const cache = require('../../../../services/core/cache')
const events = require('../../../../services/core/events')
const { HttpError } = require('../../../../utils/httpError')
const { shopFilter } = require('../../../../middleware/auth')

async function notifyOrderChanged(order) {
  if (!order) return
  await Promise.all([
    cache.invalidate(`shop:${order.shopId}:`),
    cache.invalidate('resp:dashboard:'),
    cache.invalidate('resp:analytics:'),
  ]).catch(() => {})
  await events.publish({
    type: 'sync',
    kind: 'orders',
    shopId: String(order.shopId),
    marketplace: order.marketplace,
    ok: true,
  }).catch(() => {})
}

const SORTABLE = ['placedAt', 'totals.total', 'createdAt', 'status']

/** GET / */
async function list(ctx) {
    const filter = { ...shopFilter(ctx, Order) }
    if (ctx.query.marketplace && ctx.query.marketplace !== 'all') {
      const marketplace = 'tiktok_shop'
      if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
      filter.marketplace = marketplace
    }
    if (ctx.query.shopId) {
      if (ctx.user.role === 'sub_admin' && !ctx.allowedShopIds.some((id) => String(id) === ctx.query.shopId)) {
        throw new HttpError(403, { error: 'You do not have access to this shop' })
      }
      filter.shopId = ctx.query.shopId
    }
    if (ctx.query.status && ctx.query.status !== 'all') filter.status = ctx.query.status
    if (ctx.query.from || ctx.query.to) {
      filter.placedAt = {}
      if (ctx.query.from) filter.placedAt.$gte = new Date(ctx.query.from)
      if (ctx.query.to) filter.placedAt.$lte = new Date(ctx.query.to)
    }
    const q = ctx.query.q?.trim().toLowerCase()
    if (q) {
      const candidates = await Order.find(filter)
        .sort(sortOf(ctx, SORTABLE, '-placedAt'))
      const filtered = candidates.filter((row) => [
        row.externalOrderId,
        row.shipping?.trackingNumber,
        row.buyer?.name,
        row.buyer?.username,
        row.buyer?.email,
        ...(row.items || []).flatMap((item) => [item.sku, item.title]),
      ].some((value) => String(value || '').toLowerCase().includes(q)))
      const pg = paging(ctx)
      const total = filtered.length
      return {
        data: filtered.slice(pg.skip, pg.skip + pg.limit),
        page: pg.page,
        limit: pg.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pg.limit)),
      }
    }
    const pg = paging(ctx)
    const out = await paged(Order, filter, pg, sortOf(ctx, SORTABLE, '-placedAt'))
    return out
}

/** GET /:id */
async function get(ctx) {
    const doc = await Order.findOne({ _id: ctx.params.id, ...shopFilter(ctx, Order) })
      .populate('customerId', 'name email phone identities address')
      .populate('shopId', 'name marketplace')
    if (!doc) throw new HttpError(404, { error: 'Not found' })
    return doc
}

/** POST /sync */
async function sync(ctx) {
    const filter = { status: 'connected' }
    if (ctx.user.role === 'sub_admin') {
      filter._id = { $in: ctx.allowedShopIds || [] }
    }
    if (ctx.body.shopId) {
      if (ctx.user.role === 'sub_admin' && !ctx.allowedShopIds?.some((id) => String(id) === String(ctx.body.shopId))) {
        throw new HttpError(403, { error: 'You do not have access to this shop' })
      }
      filter._id = ctx.body.shopId
    } else if (ctx.body.marketplace) {
      const marketplace = 'tiktok_shop'
      if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
      filter.marketplace = marketplace
    }

    const shops = await Shop.find(filter).select('name marketplace')
    const results = await Promise.all(shops.map(async (shop) => ({
      shopId: shop._id,
      shopName: shop.name,
      marketplace: shop.marketplace,
      ...(await syncQueue.enqueue('orders', shop._id, { wait: true })),
    })))

    return { success: true, results }
}

/** PATCH /:id/status */
async function updateStatus(ctx) {
    const existing = await Order.findOne({ _id: ctx.params.id, ...shopFilter(ctx, Order) })
    if (!existing) throw new HttpError(404, { error: 'Not found' })

    if (ctx.body.status === 'cancelled' && existing.status !== 'cancelled') {
      if (['shipped', 'delivered'].includes(existing.status)) {
        throw new HttpError(400, { error: 'Cannot cancel an order that has already shipped or delivered' })
      }
      try {
        await marketplaceManager.cancelOrder(existing, { reason: 'BUYER_ASKED_CANCEL', comment: 'Cancelled from dashboard' })
      } catch (apiErr) {
        console.warn(`Marketplace order cancellation push failed for [${existing.marketplace}]:`, apiErr.message)
        throw new HttpError(502, { error: `${existing.marketplace} could not cancel this order: ${apiErr.message}` })
      }
    }

    const doc = await Order.findOneAndUpdate(
      { _id: ctx.params.id, ...shopFilter(ctx, Order) },
      { status: ctx.body.status },
      { new: true, runValidators: true },
    )
    await notifyOrderChanged(doc)
    if (ctx.body.status === 'cancelled' && existing.status !== 'cancelled') {
      syncQueue.enqueue('listings', existing.shopId, { push: true }).catch(() => {})
    }
    return doc
}

/** PATCH /:id/shipping */
async function updateShipping(ctx) {
    const { carrier, trackingNumber } = ctx.body
    const existing = await Order.findOne({ _id: ctx.params.id, ...shopFilter(ctx, Order) })
    if (!existing) throw new HttpError(404, { error: 'Not found' })

    // Push tracking to marketplace before marking shipped locally so a rejected push does not lock the order.
    let marketplacePush = { pushed: false }
    try {
      marketplacePush = await marketplaceManager.pushShipping(existing, { carrier, trackingNumber })
    } catch (apiErr) {
      console.warn(`Shipping push to [${existing.marketplace}] failed:`, apiErr.message)
      throw new HttpError(502, {
        error: `${existing.marketplace} did not accept the tracking: ${apiErr.message}`,
        marketplacePush: { pushed: false, error: apiErr.message },
      })
    }

    existing.shipping = existing.shipping || {}
    if (carrier) existing.shipping.carrier = carrier
    if (trackingNumber) existing.shipping.trackingNumber = trackingNumber
    existing.shipping.shippedAt = new Date()
    if (marketplacePush?.pushed) existing.shipping.trackingVerified = true
    existing.status = 'shipped'
    await existing.save()

    await notifyOrderChanged(existing)
    return { order: existing, marketplacePush }
}

/** POST /:id/returns */
async function addReturn(ctx) {
    const doc = await Order.findOne({ _id: ctx.params.id, ...shopFilter(ctx, Order) })
    if (!doc) throw new HttpError(404, { error: 'Not found' })
    doc.returns.push({
      reason: ctx.body.reason,
      status: 'requested',
      refundAmount: ctx.body.refundAmount,
      requestedAt: new Date(),
    })
    await doc.save()
    return doc
}

/** PATCH /:id/returns/:index */
async function updateReturn(ctx) {
    const { status } = ctx.body
    const order = await Order.findOne({ _id: ctx.params.id, ...shopFilter(ctx, Order) })
    if (!order) throw new HttpError(404, { error: 'Order not found' })

    const idx = parseInt(ctx.params.index, 10)
    if (isNaN(idx) || !order.returns?.[idx]) {
      throw new HttpError(404, { error: 'Return record not found' })
    }

    order.returns[idx].status = status || order.returns[idx].status
    if (['approved', 'rejected', 'received'].includes(status)) {
      order.returns[idx].refundedAt = new Date()
    }
    await order.save()
    return order
}

/** POST /:id/cancel */
async function cancel(ctx) {
    const { reason = 'OUT_OF_STOCK', comment = '' } = ctx.body
    const order = await Order.findById(ctx.params.id)
    if (!order) throw new HttpError(404, { error: 'Order not found' })

    if (ctx.user.role === 'sub_admin' && !ctx.allowedShopIds.some((id) => String(id) === String(order.shopId))) {
      throw new HttpError(403, { error: 'You do not have permission to manage orders for this shop' })
    }

    if (['shipped', 'delivered'].includes(order.status)) {
      throw new HttpError(400, { error: 'Cannot cancel an order that has already shipped or delivered' })
    }

    let marketplaceResult = { success: true }
    try {
      marketplaceResult = await marketplaceManager.cancelOrder(order, { reason, comment })
    } catch (apiErr) {
      // Don't mark the order cancelled here while it is still live on the marketplace.
      console.warn(`Marketplace order cancellation push failed for [${order.marketplace}]:`, apiErr.message)
      throw new HttpError(502, { error: `${order.marketplace} could not cancel this order: ${apiErr.message}` })
    }

    order.status = 'cancelled'
    await order.save()
    await notifyOrderChanged(order)
    syncQueue.enqueue('listings', order.shopId, { push: true }).catch(() => {})

    return { success: true, order, marketplaceResult }
}

/** POST /:id/refund */
async function refund(ctx) {
    const { reason, comment, amount } = ctx.body
    const order = await Order.findById(ctx.params.id)
    if (!order) throw new HttpError(404, { error: 'Order not found' })

    if (ctx.user.role === 'sub_admin' && !ctx.allowedShopIds.some((id) => String(id) === String(order.shopId))) {
      throw new HttpError(403, { error: 'You do not have permission to manage orders for this shop' })
    }

    const refundAmount = amount ? Number(amount) : order.totals?.total || 0
    const prevRefunded = (order.returns || []).reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0)

    // Push refund to connected marketplace API
    let marketplaceResult = { success: true }
    try {
      marketplaceResult = await marketplaceManager.processRefund(order, { reason, comment, amount: refundAmount })
    } catch (apiErr) {
      console.warn(`Marketplace refund push failed for [${order.marketplace}]:`, apiErr.message)
      throw new HttpError(502, { error: `${order.marketplace} could not refund this order: ${apiErr.message}` })
    }

    if (!order.totals?.total || prevRefunded + refundAmount >= order.totals.total) {
      order.status = 'refunded'
    }
    order.returns.push({
      reason: reason || 'Buyer requested refund',
      status: 'received',
      refundAmount,
      refundedAt: new Date(),
      requestedAt: new Date(),
    })
    await order.save()
    await notifyOrderChanged(order)

    return { success: true, order, marketplaceResult }
}

/** GET /:id/price-detail — the order's price breakdown from TikTok (discounts, shipping, tax, what the buyer paid). */
async function priceDetail(ctx) {
    const order = await Order.findOne({ _id: ctx.params.id, marketplace: 'tiktok_shop' })
    if (!order) throw new HttpError(404, { error: 'Order not found' })
    if (ctx.user.role === 'sub_admin' && !(ctx.allowedShopIds || []).some((id) => String(id) === String(order.shopId))) {
      throw new HttpError(403, { error: 'You do not have permission to see orders of this shop' })
    }
    const shop = await Shop.findOne({ _id: order.shopId, status: 'connected' })
    if (!shop) throw new HttpError(404, { error: 'The shop of this order is not connected' })
    const tiktok = require('../../service')
    const p = await marketplaceManager.withShopToken(shop, (token) => tiktok.call(token, 'GET', `/order/202407/orders/${encodeURIComponent(order.externalOrderId)}/price_detail`, { shop }))
    const currency = p.currency || 'USD'
    const num = (...keys) => Math.round(keys.reduce((t, k) => t + (Number(p[k]) || 0), 0) * 100) / 100
    const line = (label, value) => ({ label, amount: { value, currency } })
    const lines = [
        line('Products (list price)', num('sku_list_price')),
        line('Seller discounts', -num('subtotal_deduction_seller', 'voucher_deduction_seller')),
        line('TikTok discounts', -num('subtotal_deduction_platform', 'voucher_deduction_platform')),
        line('Shipping', num('shipping_list_price')),
        line('Shipping discounts (seller)', -num('shipping_fee_deduction_seller')),
        line('Shipping discounts (TikTok)', -num('shipping_fee_deduction_platform', 'shipping_fee_deduction_platform_voucher')),
        line('Tax', num('tax_amount')),
    ]
    // COD, distance and other fees TikTok adds: one line so the breakdown always adds up to what was paid.
    const rest = Math.round((num('payment') - lines.reduce((t, l) => t + l.amount.value, 0)) * 100) / 100
    if (rest !== 0) lines.push(line('Other fees and adjustments', rest))
    return { lines, total: line('Buyer paid', num('payment')) }
}

module.exports = { priceDetail, list, get, sync, updateStatus, updateShipping, addReturn, updateReturn, cancel, refund }
