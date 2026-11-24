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
      const marketplace = 'temu'
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
    // Late: still to ship and past Temu's ship-by date.
    if (ctx.query.late === '1') {
      filter.status = 'paid'
      filter['shipping.shipBy'] = { $lt: new Date() }
    }
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

/**
 * GET /counts — Temu orders per state for the status pills, and the late ones (to ship, past
 * Temu's ship-by date): `{ all, toShip, late, shipped, delivered, cancelled, unpaid }`.
 */
async function counts(ctx, { now = new Date() } = {}) {
    const base = { ...shopFilter(ctx, Order), marketplace: 'temu' }
    const rows = await Order.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }])
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]))
    const late = await Order.countDocuments({ ...base, status: 'paid', 'shipping.shipBy': { $lt: now } })
    return {
      all: rows.reduce((t, r) => t + r.n, 0),
      toShip: by.paid || 0,
      late,
      shipped: by.shipped || 0,
      delivered: by.delivered || 0,
      cancelled: by.cancelled || 0,
      unpaid: by.pending || 0,
    }
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
      const marketplace = 'temu'
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

/** A Temu order the user may see: its shop must be one of theirs (sub-admins) and connected. */
async function temuOrderFor(ctx, { needOrders = false } = {}) {
    const user = ctx.authUser || ctx.user
    if (needOrders && user.role === 'sub_admin' && !user.mainRoutes?.includes('orders')) {
      throw new HttpError(403, { error: 'You need the Orders permission to see a buyer\'s address' })
    }
    const order = await Order.findOne({ _id: ctx.params.id, marketplace: 'temu' })
    if (!order) throw new HttpError(404, { error: 'Order not found' })
    if (user.role === 'sub_admin' && !(ctx.allowedShopIds || []).some((id) => String(id) === String(order.shopId))) {
      throw new HttpError(403, { error: 'You do not have permission to see orders of this shop' })
    }
    const shop = await Shop.findOne({ _id: order.shopId, status: 'connected' })
    if (!shop) throw new HttpError(404, { error: 'The shop of this order is not connected' })
    return { order, shop }
}

const amountOf = (m) => (m && m.amount != null ? { value: Number(m.amount), currency: m.currency || 'USD' } : null)

/** GET /:id/temu-detail — Temu's full order detail: items, amount breakdown, status and timeline. */
async function temuDetail(ctx) {
    const { order, shop } = await temuOrderFor(ctx)
    const temu = require('../../service')
    const sn = order.externalOrderId
    const [detail, amount] = await marketplaceManager.withShopToken(shop, async (token) => [
      await temu.call('bg.order.detail.v2.get', { access_token: token, parentOrderSn: sn }),
      await temu.call('temu.order.amount.v2.query', { access_token: token, parentOrderSn: sn }).catch(() => null),
    ])
    const unit = new Map((amount?.orderList || []).map((l) => [String(l.orderSn), amountOf(l.unitRetailPrice || l.unitRetailPriceVatIncl)]))
    const paid = amount?.parentOrderMap?.customerPaid || {}
    const proceeds = amount?.parentOrderMap?.salesProceeds || {}
    const neg = (m) => (m ? { ...m, value: -Math.abs(m.value) } : null)
    const parent = detail.parentOrderMap || {}
    const when = (t) => (t ? new Date(Number(t) * (String(t).length > 11 ? 1 : 1000)).toISOString() : null)
    return {
      items: (detail.orderList || []).map((l) => ({ goodsId: String(l.goodsId), skuId: String(l.skuId), title: l.goodsName || '', spec: l.spec || '', qty: l.quantity ?? 0, price: unit.get(String(l.orderSn)) || null })),
      amounts: [
        ['Products', amountOf(paid.retailPriceTotalTaxIncl)],
        ['Seller discount', neg(amountOf(paid.retailPriceSellerDiscountTaxExcl))],
        ['Temu discount', neg(amountOf(paid.retailPriceTemuDiscountTaxExcl))],
        ['Shipping', amountOf(paid.shippingTotalTaxIncl)],
        ['Buyer paid', amountOf(paid.customerPaidTotal)],
        ['Estimated settlement to you', amountOf(proceeds.estimatedSettlementTotal)],
      ].filter(([, a]) => a).map(([label, a]) => ({ label, amount: a })),
      ...(amount ? {} : { amountsNote: "Temu doesn't share order amounts with this app (Temu US). See the amounts in Seller Center." }),
      status: parent.parentOrderStatus ?? null,
      timeline: [
        ['Ordered', when(parent.parentOrderTime)],
        ['Ship by', when(parent.expectShipLatestTime)],
        ['Shipped', when(parent.parentShippingTime)],
        ['Deliver by', when(parent.latestDeliveryTime)],
      ].filter(([, t]) => t).map(([label, time]) => ({ label, time })),
    }
}

/**
 * POST /:id/full-address — the buyer's unmasked address, fetched from Temu only when asked.
 * Needs the Orders permission; never stored, cached or logged.
 */
async function fullAddress(ctx) {
    const { order, shop } = await temuOrderFor(ctx, { needOrders: true })
    const temu = require('../../service')
    const info = await marketplaceManager.withShopToken(shop, (token) => temu.call('bg.order.decryptshippinginfo.get', { access_token: token, parentOrderSn: order.externalOrderId }))
    const cityLine = [info.regionName3, [info.regionName2, info.postCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    return {
      name: info.receiptName || [info.addressExtra?.firstName, info.addressExtra?.lastName].filter(Boolean).join(' '),
      phone: info.mobile || '',
      address: [info.addressLine1, info.addressLine2, info.addressLine3, cityLine, info.regionName1].filter(Boolean).join(', '),
    }
}

const unixIso = (t) => (t != null && t !== '' ? new Date(Number(t) * (String(t).length > 11 ? 1 : 1000)).toISOString() : null)

/** Runs Temu calls for an order's shop, each behind the app's granted-method check. */
function temuRun(shop, fn) {
    const temu = require('../../service')
    const { grantAware } = require('../../sections/helpers')
    return marketplaceManager.withShopToken(shop, (token) => fn((method, params = {}) => grantAware(shop, method, () => temu.call(method, { access_token: token, ...params }))()))
}

/**
 * GET /:id/temu-follow-up — after the sale: each package with its tracking events, the buyer's
 * customisation, and Temu's result for out-of-stock cancellations (codes Temu doesn't document
 * are shown as "Temu status N").
 */
async function temuFollowUp(ctx) {
    const { order, shop } = await temuOrderFor(ctx)
    const sn = order.externalOrderId
    return temuRun(shop, async (call) => {
      const detail = await call('bg.order.detail.v2.get', { parentOrderSn: sn })
      const items = new Map((detail.orderList || []).map((l) => [String(l.orderSn), l.goodsName || '']))
      const [shipments, custom, oos] = await Promise.all([
        call('bg.logistics.shipment.v2.get', { parentOrderSn: sn }).catch(() => ({ shipmentInfoDTO: [] })),
        items.size ? call('bg.order.customization.get', { orderSnList: [...items.keys()] }).catch(() => []) : [],
        call('temu.order.cancel.outofstock.result.get', { parentOrderSn: sn }).catch(() => ({ applyResultInfoList: [] })),
      ])
      const seen = new Set()
      const pkgs = (shipments.shipmentInfoDTO || []).flatMap((s) => [s, ...(s.subPackageShipmentInfoList || [])]).filter((p) => p.packageSn && !seen.has(p.packageSn) && seen.add(p.packageSn))
      const packages = await Promise.all(pkgs.map(async (p) => {
        const t = await call('temu.track.trackinginfo.get', { packageSn: p.packageSn }).catch(() => ({ trackingInfo: [] }))
        return {
          packageSn: p.packageSn,
          carrier: p.carrierName || '',
          trackingNumber: p.trackingNumber || t.trackingNum || '',
          events: (t.trackingInfo || []).map((e) => ({ status: e.statusText || e.logisticsStatus || '', time: unixIso(e.logisticsUpdatedAt) })).sort((a, b) => String(b.time).localeCompare(String(a.time))),
        }
      }))
      return {
        items: [...items].map(([orderSn, item]) => ({ orderSn, item })),
        packages,
        customizations: (Array.isArray(custom) ? custom : custom?.list || []).map((c) => ({ orderSn: String(c.orderSn), item: items.get(String(c.orderSn)) || '', text: c.customizedText || '', images: (c.previewList || []).map((p) => p.imageUrl).filter(Boolean) })),
        cancellations: (oos.applyResultInfoList || []).map((r) => ({ orderSn: String(r.orderSn), item: items.get(String(r.orderSn)) || '', status: `Temu status ${r.applyStatus}` })),
      }
    })
}

/** GET /temu-ship-together — Temu's groups of orders that can ship in one package, and unshipped packages. */
async function shipTogether(ctx) {
    const { canUseSection } = require('../../../../middleware/auth')
    if (!canUseSection(ctx.authUser || ctx.user, 'temu', 'orders', 'orders')) throw new HttpError(403, { error: 'You do not have access to Orders on this shop' })
    const filter = { marketplace: 'temu', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: 'No connected Temu shop' })
    return temuRun(shop, async (call) => {
      const res = await call('bg.order.combinedshipment.list.get')
      const groups = (res.combinedShippingGroups || []).map((g) => ({ orders: (g.combinedShippingGroup || []).map((o) => ({ parentOrderSn: String(o.parentOrderSn), ordered: unixIso(o.parentOrderTime) })) })).filter((g) => g.orders.length)
      const sns = groups.flatMap((g) => g.orders.map((o) => o.parentOrderSn)).slice(0, 50)
      const unshipped = sns.length ? await call('bg.order.unshipped.package.get', { parentOrderSnList: sns, pageNumber: 1, pageSize: 50 }).catch(() => ({ unshippedPackage: [] })) : { unshippedPackage: [] }
      return {
        groups,
        unshippedPackages: (unshipped.unshippedPackage || []).map((p) => ({ packageSn: p.packageSn, carrier: p.carrierName || '', trackingNumber: p.trackingNumber || '', orders: [...new Set((p.packageDetail?.shippableOrders || []).map((o) => String(o.parentOrderSn)))] })),
      }
    })
}

/** POST /:id/verification { items: [{ orderSn, serialNumber?, imeiNumbers? }] } — details Temu asks for before shipping. */
async function uploadVerification(ctx) {
    const { order, shop } = await temuOrderFor(ctx)
    const items = (Array.isArray(ctx.body?.items) ? ctx.body.items : []).map((i) => ({
      orderSn: String(i.orderSn || ''),
      serialNumber: String(i.serialNumber || '').trim(),
      imei: (Array.isArray(i.imeiNumbers) ? i.imeiNumbers : []).map((x) => String(x).trim()).filter(Boolean),
    })).filter((i) => i.orderSn && (i.serialNumber || i.imei.length))
    if (!items.length) throw new HttpError(400, { error: 'Enter a serial number or IMEI for at least one item.' })
    return temuRun(shop, async (call) => {
      const detail = await call('bg.order.detail.v2.get', { parentOrderSn: order.externalOrderId })
      const own = new Set((detail.orderList || []).map((l) => String(l.orderSn)))
      if (items.some((i) => !own.has(i.orderSn))) throw new HttpError(400, { error: 'An item is not part of this order.' })
      await call('temu.local.order.verification.upload', {
        orderList: items.map((i) => ({ orderSn: i.orderSn, verificationInfo: [{ ...(i.serialNumber ? { serialNumber: i.serialNumber } : {}), ...(i.imei.length ? { imeiNumberList: i.imei } : {}) }] })),
      })
      return { message: 'Verification details sent to Temu.' }
    })
}

module.exports = { counts, temuOrderFor, temuRun, temuFollowUp, shipTogether, uploadVerification, temuDetail, fullAddress, list, get, sync, updateStatus, updateShipping, addReturn, updateReturn, cancel, refund }
