/**
 * Temu buy-shipping for an order (37-order-fulfillment-guide.md), Temu US units (lb, in):
 * services with prices for the package, buying a label (asynchronous: Temu's
 * shipment.result.get decides — 0 in application, 1 bought, 2 failed), buying again after a
 * failure, the label file (Temu's link is signed with toa-* headers, so it is fetched here and
 * handed over, never stored), switching a package to the seller's own carrier, and pickups.
 */
const crypto = require('crypto')
const config = require('../../config')
const { HttpError } = require('../../../../utils/httpError')
const { temuOrderFor, temuRun } = require('./orders')

const POLLS = 5
const POLL_MS = 2000
const STATUS = { 0: 'pending', 1: 'bought', 2: 'failed' }
const oneDecimal = (v) => String(Number((Math.round(Number(v) * 10) / 10).toFixed(1)))

/** The package's weight (lb) and size (in), one decimal, within Temu US limits. */
function packageOf(src = {}) {
  const ok = (v, max) => Number.isFinite(Number(v)) && Number(oneDecimal(v)) >= 0.1 && Number(oneDecimal(v)) <= max
  if (!ok(src.weight, 9999.9)) throw new HttpError(400, { error: 'Enter the package weight in lb.' })
  if (![src.length, src.width, src.height].every((d) => ok(d, 999.9))) throw new HttpError(400, { error: 'Enter the package length, width and height in inches.' })
  return { weight: oneDecimal(src.weight), weightUnit: 'lb', length: oneDecimal(src.length), width: oneDecimal(src.width), height: oneDecimal(src.height), dimensionUnit: 'in' }
}
const packageSnOf = (v) => {
  const sn = String(v || '').trim()
  if (!/^[\w-]{1,64}$/.test(sn)) throw new HttpError(400, { error: 'Unknown package' })
  return sn
}

/** The shop's warehouse that can buy labels (the default one first). */
async function warehouseId(call) {
  const res = await call('bg.logistics.warehouse.list.get', { returnEnableBuyShippingLabelOnly: true })
  const list = (res.warehouseList || []).filter((w) => w.enableBuyShippingLabel !== false)
  const w = list.find((x) => x.defaultWarehouse) || list[0]
  if (!w) throw new HttpError(400, { error: 'No warehouse of this shop can buy Temu labels. Set one up in Seller Center.' })
  return w.warehouseId
}

/** The order's items as Temu has them now. */
async function orderLines(call, order) {
  const detail = await call('bg.order.detail.v2.get', { parentOrderSn: order.externalOrderId })
  return (detail.orderList || []).map((l) => ({ orderSn: String(l.orderSn), parentOrderSn: order.externalOrderId, goodsId: l.goodsId, skuId: l.skuId, quantity: l.quantity }))
}

/** GET /:id/label-services?weight=&length=&width=&height= */
async function services(ctx) {
  const pkg = packageOf(ctx.query)
  const { order, shop } = await temuOrderFor(ctx)
  return temuRun(shop, async (call) => {
    const lines = await orderLines(call, order)
    const res = await call('bg.logistics.shippingservices.get', { warehouseId: await warehouseId(call), orderSnList: lines.map((l) => l.orderSn), ...pkg })
    const list = (res.onlineChannelDtoList || []).map((c) => ({
      channelId: c.channelId,
      shipCompanyId: c.shipCompanyId,
      carrier: c.shippingCompanyName || '',
      service: c.shipLogisticsType || '',
      price: c.estimatedAmount != null ? { value: Number(c.estimatedAmount), currency: c.estimatedCurrencyCode || 'USD' } : null,
      estimate: c.estimatedText || '',
    }))
    return {
      services: list,
      unavailable: (res.unavailableChannelDtoList || []).map((c) => ({ carrier: c.shippingCompanyName || '', reason: c.unavailableReason || '' })),
      ...(list.length ? {} : { message: 'Temu has no shipping service for this package. Check the weight and size, or ship with your own carrier.' }),
    }
  })
}

/** Temu's result for packages, waiting a little while Temu is still buying. */
async function result(call, packageSns) {
  let info = []
  for (let i = 0; i < POLLS; i += 1) {
    const res = await call('bg.logistics.shipment.result.get', { packageSnList: packageSns })
    info = res.packageInfoResultList || []
    if (info.length && info.every((p) => Number(p.shippingLabelStatus) !== 0)) break
    if (i < POLLS - 1) await labels.wait(POLL_MS)
  }
  const p = info[0] || {}
  const status = STATUS[Number(p.shippingLabelStatus)] || 'pending'
  return {
    status,
    packageSn: p.packageSn || packageSns[0],
    trackingNumber: p.trackingNumber || '',
    carrier: p.shippingCompanyName || '',
    ...(status === 'failed' ? { reason: p.failReasonText || 'Temu could not buy the label.', message: `Temu could not buy the label: ${p.failReasonText || 'no reason given'}.` } : {}),
    ...(status === 'pending' ? { message: 'Temu is still buying the label. Refresh in a minute.' } : {}),
    ...(status === 'bought' ? { message: `Label bought: ${p.shippingCompanyName || ''} ${p.trackingNumber || ''}`.trim() } : {}),
  }
}

const choiceOf = (b) => {
  if (!Number.isInteger(Number(b?.channelId)) || !Number.isInteger(Number(b?.shipCompanyId))) throw new HttpError(400, { error: 'Choose a shipping service.' })
  return { channelId: Number(b.channelId), shipCompanyId: Number(b.shipCompanyId), shipLogisticsType: String(b.service || '') }
}

/** POST /:id/buy-label { channelId, shipCompanyId, service, weight, length, width, height } */
async function buy(ctx) {
  const choice = choiceOf(ctx.body)
  const pkg = packageOf(ctx.body)
  const { order, shop } = await temuOrderFor(ctx, { needOrders: true })
  return temuRun(shop, async (call) => {
    const lines = await orderLines(call, order)
    const res = await call('bg.logistics.shipment.create', {
      sendType: 0,
      shipLater: false,
      sendRequestList: [{ warehouseId: await warehouseId(call), ...choice, orderSendInfoList: lines, ...pkg }],
    })
    const sns = res.packageSnList || []
    if (!sns.length) throw new HttpError(502, { error: 'Temu did not start buying the label.' })
    return result(call, sns)
  })
}

/** POST /:id/label-retry { packageSn, channelId, shipCompanyId, service, weight, … } — buys again after a failure. */
async function retry(ctx) {
  const packageSn = packageSnOf(ctx.body?.packageSn)
  const choice = choiceOf(ctx.body)
  const pkg = packageOf(ctx.body)
  const { shop } = await temuOrderFor(ctx, { needOrders: true })
  return temuRun(shop, async (call) => {
    await call('bg.logistics.shipment.update', { retrySendPackageRequestList: [{ packageSn, warehouseId: await warehouseId(call), ...choice, ...pkg }] })
    return result(call, [packageSn])
  })
}

/** POST /:id/own-carrier { packageSn, shipCompanyId, trackingNumber } — ship this package yourself instead. */
async function ownCarrier(ctx) {
  const packageSn = packageSnOf(ctx.body?.packageSn)
  const trackingNumber = String(ctx.body?.trackingNumber || '').trim()
  if (!trackingNumber || !Number.isInteger(Number(ctx.body?.shipCompanyId))) throw new HttpError(400, { error: 'Choose the carrier and enter the tracking number.' })
  const { shop } = await temuOrderFor(ctx, { needOrders: true })
  return temuRun(shop, async (call) => {
    await call('bg.logistics.shipment.shippingtype.update', { editPackageRequestList: [{ packageSn, shipCompanyId: Number(ctx.body.shipCompanyId), trackingNumber, selfShippingWarehouseId: await warehouseId(call) }] })
    return { message: `Package ${packageSn} now ships with your own carrier (${trackingNumber}).` }
  })
}

/** Temu's toa-* headers for its signed label links (same signing as API calls). */
function toaHeaders(token) {
  const head = {
    'toa-access-token': token,
    'toa-app-key': config.appKey,
    'toa-random': Array.from(crypto.randomBytes(32), (b) => String(b % 10)).join(''),
    'toa-timestamp': String(Math.floor(Date.now() / 1000)),
  }
  const text = Object.keys(head).sort().map((k) => `${k}${head[k]}`).join('')
  head['toa-sign'] = crypto.createHash('md5').update(`${config.appSecret}${text}${config.appSecret}`).digest('hex').toUpperCase()
  return head
}

/** GET /:id/label?packageSn= — the label file, fetched from Temu's signed link (valid 10 minutes) and handed over. */
async function labelFile(ctx) {
  const packageSn = packageSnOf(ctx.query?.packageSn)
  const { shop } = await temuOrderFor(ctx)
  return temuRun(shop, async (call) => {
    const res = await call('bg.logistics.shipment.document.get', { packageSnList: [packageSn] })
    const url = (res.shippingLabelUrlList || []).find((l) => l.packageSn === packageSn)?.url || res.shippingLabelUrlList?.[0]?.url
    if (!url) throw new HttpError(404, { error: 'Temu has no label for this package yet.' })
    const token = await require('../manager').withShopToken(shop, (t) => t)
    const file = await fetch(url, { headers: toaHeaders(token) })
    if (!file.ok) throw new HttpError(502, { error: `Temu did not hand over the label (${file.status}).` })
    return { contentType: file.headers.get('content-type') || 'application/pdf', buffer: Buffer.from(await file.arrayBuffer()), name: `temu-label-${packageSn}.pdf` }
  })
}

/** POST /:id/pickup { packageSn, start, end } — books a carrier pickup for a package. */
async function pickup(ctx) {
  const packageSn = packageSnOf(ctx.body?.packageSn)
  const start = Date.parse(ctx.body?.start)
  const end = Date.parse(ctx.body?.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new HttpError(400, { error: 'Choose a pickup window (the end after the start).' })
  const { shop } = await temuOrderFor(ctx, { needOrders: true })
  return temuRun(shop, async (call) => {
    await call('temu.logistics.shipment.pickup.reservation.create', { packageSnList: [packageSn], pickupStartTime: Math.floor(start / 1000), pickupEndTime: Math.floor(end / 1000) })
    return { message: `Pickup requested for package ${packageSn}.` }
  })
}

/** GET /:id/pickup?packageSn= */
async function pickupStatus(ctx) {
  const packageSn = packageSnOf(ctx.query?.packageSn)
  const { shop } = await temuOrderFor(ctx)
  return temuRun(shop, async (call) => {
    const res = await call('temu.logistics.shipment.pickup.reservation.result.get', { packageSnList: [packageSn] })
    return { reservations: (res.reservationResultList || []).map((r) => ({ reservationSn: r.reservationSn, packages: r.packageSnList || [], status: `Temu status ${r.reservationStatus}` })) }
  })
}

/** POST /:id/pickup-cancel { reservationSn } */
async function cancelPickup(ctx) {
  const reservationSn = packageSnOf(ctx.body?.reservationSn)
  const { shop } = await temuOrderFor(ctx, { needOrders: true })
  return temuRun(shop, async (call) => {
    await call('temu.logistics.shipment.pickup.reservation.cancel', { reservationSn })
    return { message: 'Pickup cancelled.' }
  })
}

const labels = { services, buy, retry, ownCarrier, labelFile, pickup, pickupStatus, cancelPickup, toaHeaders, wait: (ms) => new Promise((r) => setTimeout(r, ms)) }
module.exports = labels
