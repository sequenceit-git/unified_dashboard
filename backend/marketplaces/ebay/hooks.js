/**
 * eBay steps inside the shared sync (services/marketplace): how orders and listings are read,
 * shipping line items, item images and connecting from .env. The core calls these through
 * `adapter.hooks`; it never checks for eBay by name.
 */
const Order = require('../../models/Order')
const Shop = require('../../models/Shop')
const Listing = require('../../models/Listing')
const config = require('./config')
const { ebaySku } = require('./sku')
const { productKey, listingAliases } = require('../../services/marketplace/listingKeys')

/** Resolved public image URLs for variant images (eBay fetches them itself). */
function listingVariants(manager, variants) {
  return variants.map((v) => {
    if (!v?.image) return v
    const resolved = manager.publicImageUrls([v.image])[0]
    return resolved ? { ...v, image: resolved } : { ...v, image: undefined }
  })
}

/** Orders imported before line-item IDs were stored: read them from eBay. */
async function shippingLineItems(service, token, order, lineItems) {
  if (lineItems.length === (order.items || []).length) return lineItems
  const remote = await service.getOrder(token, order.externalOrderId)
  return (remote.lineItems || []).map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity }))
}

/** App token for the Browse API (item images); null when it can't be had. */
async function orderAppToken(service) {
  if (typeof service.getApplicationToken !== 'function') return null
  try {
    return await service.getApplicationToken()
  } catch {
    return null
  }
}

/**
 * All eBay orders changed since the last complete sync (everything eBay still returns on the
 * first run), read page by page. `complete` is false if the page cap was hit, so the sync
 * cursor is not advanced and the remainder is picked up next time.
 */
/** eBay's latest ship time for an order: the earliest line item shipByDate (undefined when none). */
function ebayShipBy(o) {
  const dates = (o?.lineItems || []).map((li) => li.lineItemFulfillmentInstructions?.shipByDate).filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined
}

async function fetchEbayOrders(shop, token, service) {
  const OVERLAP_MS = 60 * 60 * 1000
  const PAGE = 200
  const MAX_PAGES = 25
  const since = shop.ordersSyncedAt ? new Date(new Date(shop.ordersSyncedAt).getTime() - OVERLAP_MS) : null
  const filter = since ? `lastmodifieddate:[${since.toISOString()}..]` : ''
  const orders = []
  let complete = true
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await service.getOrders(token, { limit: PAGE, offset: page * PAGE, filter })
    orders.push(...(res.orders || []))
    if (!res.next || !(res.orders || []).length) break
    if (page === MAX_PAGES - 1) complete = false
  }
  return { orders, complete }
}

/**
 * Fills in the real tracking number, carrier and ship date of shipped eBay orders from their
 * shipment records. Orders already verified are skipped; at most 40 are read per run so a
 * large backlog heals over several runs.
 */
async function attachEbayTracking(shop, token, service, rawOrders) {
  const shipped = rawOrders.filter((order) => order.hasFulfillment)
  if (!shipped.length || typeof service.getShippingFulfillments !== 'function') return
  const stored = await Order.find({ shopId: shop._id, externalOrderId: { $in: shipped.map((order) => order.externalOrderId) } })
    .select('externalOrderId shipping.trackingVerified').lean()
  const verified = new Set(stored.filter((order) => order.shipping?.trackingVerified).map((order) => order.externalOrderId))
  const queue = shipped.filter((order) => !verified.has(order.externalOrderId)).slice(0, 40)
  const worker = async () => {
    while (queue.length) {
      const order = queue.shift()
      const records = await service.getShippingFulfillments(token, order.externalOrderId)
      const latest = [...records].sort((a, b) => new Date(b.shippedDate || 0) - new Date(a.shippedDate || 0))[0]
      const tracking = latest?.shipmentTrackingNumber || latest?.trackingNumber
      if (!tracking) continue
      order.shipping = {
        ...order.shipping,
        carrier: latest.shippingCarrierCode || order.shipping?.carrier,
        trackingNumber: String(tracking),
        shippedAt: latest.shippedDate ? new Date(latest.shippedDate) : undefined,
        trackingVerified: true,
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

async function fetchOrders(manager, shop, token, service) {
  let rawOrders = []
  let complete = true
    const [res, rawCancellations, rawReturns] = await Promise.all([
      fetchEbayOrders(shop, token, service),
      typeof service.getCancellations === 'function' ? service.getCancellations(token).catch(() => []) : [],
      typeof service.getReturns === 'function' ? service.getReturns(token).catch(() => []) : [],
    ])

    const cancelledOrderIds = new Set()
    for (const c of rawCancellations || []) {
      const cStatus = String(c.cancelStatus || c.cancelState || '').toUpperCase()
      const isFinalCancel =
        !cStatus.includes('REJECT') &&
        !cStatus.includes('REQUEST') &&
        !cStatus.includes('PENDING') &&
        (cStatus.includes('CLOSED') || cStatus.includes('COMPLETE') || cStatus.includes('APPROV') || cStatus === 'CANCELED' || cStatus === 'CANCELLED')
      if (isFinalCancel) {
        if (c.orderId) cancelledOrderIds.add(String(c.orderId))
        if (c.legacyOrderId) cancelledOrderIds.add(String(c.legacyOrderId))
      }
    }

    const returnedOrderMap = new Map()
    for (const r of rawReturns || []) {
      if (r.orderId) returnedOrderMap.set(String(r.orderId), r)
    }

    // Backfill older orders that have post-order cancellations or returns outside the incremental lastmodifieddate window.
    res.orders = res.orders || []
    if (typeof service.getOrder === 'function') {
      const fetchedIds = new Set()
      for (const o of res.orders) {
        if (o.orderId) fetchedIds.add(String(o.orderId))
        if (o.legacyOrderId) fetchedIds.add(String(o.legacyOrderId))
      }
      const affectedIds = [...new Set([...cancelledOrderIds, ...returnedOrderMap.keys()])].filter((id) => id && !fetchedIds.has(id))
      if (affectedIds.length) {
        const staleRows = await Order.find({
          shopId: shop._id,
          externalOrderId: { $in: affectedIds },
          status: { $nin: ['cancelled', 'refunded'] },
        }).select('externalOrderId').limit(20).lean()
        for (const row of staleRows) {
          const extraOrder = await service.getOrder(token, row.externalOrderId).catch(() => null)
          if (extraOrder?.orderId) res.orders.push(extraOrder)
        }
      }
    }

    const now = new Date()

    rawOrders = (res.orders || []).map((o) => {
      const reg = o.buyer?.buyerRegistrationAddress
      const tax = o.buyer?.taxAddress
      const shipTo = o.fulfillmentStartPlans?.[0]?.shippingStep?.shipTo || o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo
      const username = o.buyer?.username || ''
      const fullName = reg?.fullName || shipTo?.fullName || username || 'eBay Customer'
      // eBay hides most buyer emails; keep it empty rather than inventing an address.
      const email = reg?.email || shipTo?.email || ''
      const phone = reg?.primaryPhone?.phoneNumber || shipTo?.primaryPhone?.phoneNumber || tax?.primaryPhone?.phoneNumber || ''
      const address = {
        street: reg?.contactAddress?.addressLine1 || shipTo?.contactAddress?.addressLine1 || '',
        city: reg?.contactAddress?.city || shipTo?.contactAddress?.city || tax?.city || '',
        state: reg?.contactAddress?.stateOrProvince || shipTo?.contactAddress?.stateOrProvince || tax?.stateOrProvince || '',
        zip: reg?.contactAddress?.postalCode || shipTo?.contactAddress?.postalCode || tax?.postalCode || '',
        country: reg?.contactAddress?.countryCode || shipTo?.contactAddress?.countryCode || tax?.countryCode || '',
      }

      // Accurate eBay order status detection:
      const extId = String(o.orderId || '')
      const legacyId = String(o.legacyOrderId || '')
      const cancelState = String(
        o.cancelStatus?.cancelState ||
        o.cancelStatus?.status ||
        o.cancelStatus ||
        ''
      ).toUpperCase()
      const hasCancelledDate = Boolean(o.cancelStatus?.cancelledDate)

      // Delivery & shipping metadata:
      const shipPlan = o.fulfillmentStartPlans?.[0] || o.fulfillmentStartInstructions?.[0]
      const carrier = shipPlan?.shippingStep?.shippingCarrierCode || ''
      const maxEstimatedDeliveryStr = shipPlan?.maxEstimatedDeliveryDate || ''
      const maxEstimatedDelivery = maxEstimatedDeliveryStr ? new Date(maxEstimatedDeliveryStr) : null
      const isPastEstimatedDelivery = Boolean(maxEstimatedDelivery && maxEstimatedDelivery <= now)

      // fulfillmentHrefs hold eBay's fulfillment IDs, not tracking numbers; the real tracking
      // number, carrier and ship date are read from the shipment records afterwards.
      const hasFulfillment = Array.isArray(o.fulfillmentHrefs) && o.fulfillmentHrefs.length > 0

      // Refunds detection:
      const refundsList = Array.isArray(o.paymentSummary?.refunds) ? o.paymentSummary.refunds : []
      const totalRefundedFromList = refundsList.reduce((sum, r) => sum + parseFloat(r.amount?.value || 0), 0)
      const totalRefundedFromPricing = parseFloat(o.pricingSummary?.refundedAmount?.value || 0)
      const refundedValue = Math.max(totalRefundedFromList, totalRefundedFromPricing)
      const totalValue = parseFloat(o.pricingSummary?.total?.value || 0)
      const paymentStatus = String(o.orderPaymentStatus || '').toUpperCase()

      const isFullyRefunded =
        paymentStatus === 'FULLY_REFUNDED' ||
        paymentStatus === 'REFUNDED' ||
        (refundedValue > 0 && totalValue > 0 && refundedValue >= totalValue)

      // Post-order returns check:
      const ret = returnedOrderMap.get(extId) || (legacyId ? returnedOrderMap.get(legacyId) : null)
      const orderReturns = []
      if (ret) {
        const refundAmt = Number(ret.sellerTotalRefund?.actualRefundAmount?.value ?? ret.buyerTotalRefund?.actualRefundAmount?.value ?? 0)
        orderReturns.push({
          reason: ret.creationInfo?.comments?.content || ret.creationInfo?.reason || 'Customer return',
          status: ret.status === 'CLOSED' ? 'received' : 'requested',
          refundAmount: refundAmt || undefined,
          requestedAt: ret.creationInfo?.creationDate?.value ? new Date(ret.creationInfo.creationDate.value) : undefined,
          refundedAt: ret.status === 'CLOSED' ? (ret.creationInfo?.creationDate?.value ? new Date(ret.creationInfo.creationDate.value) : new Date()) : undefined,
        })
      }

      let orderStatus = 'paid'
      const isCancelled =
        cancelledOrderIds.has(extId) ||
        (legacyId && cancelledOrderIds.has(legacyId)) ||
        hasCancelledDate ||
        cancelState === 'CANCELED' ||
        cancelState === 'CANCELLED' ||
        cancelState === 'CANCEL_CLOSED' ||
        cancelState === 'CANCEL_CLOSED_WITH_REFUND' ||
        cancelState === 'CANCEL_COMPLETE' ||
        cancelState === 'CLOSED_WITH_REFUND' ||
        (cancelState.startsWith('CANCEL') && !/REJECT|NONE|REQUEST|PENDING|IN_PROGRESS/.test(cancelState))

      if (isCancelled) {
        orderStatus = 'cancelled'
      } else if (ret) {
        const retState = String(ret.state || ret.status || '').toUpperCase()
        const refundAmt = Number(ret.sellerTotalRefund?.actualRefundAmount?.value ?? 0)
        if (retState.includes('CLOSED') && (refundAmt > 0 || isFullyRefunded)) {
          orderStatus = 'refunded'
        } else {
          orderStatus = 'returned'
        }
      } else if (isFullyRefunded) {
        orderStatus = o.orderFulfillmentStatus === 'FULFILLED' ? 'returned' : 'refunded'
      } else if (o.orderFulfillmentStatus === 'FULFILLED') {
        // If the package was fulfilled and its estimated delivery date has passed, it's delivered
        if (isPastEstimatedDelivery) {
          orderStatus = 'delivered'
        } else {
          orderStatus = 'shipped'
        }
      } else if (o.orderFulfillmentStatus === 'IN_PROGRESS') {
        orderStatus = 'processing'
      } else if (paymentStatus === 'PAID') {
        orderStatus = 'paid'
      } else if (
        paymentStatus === 'FAILED' ||
        paymentStatus === 'PENDING' ||
        paymentStatus === 'BUYER_PAYMENT_DUE' ||
        paymentStatus === 'UNPAID' ||
        paymentStatus === 'NOT_APPLICABLE'
      ) {
        orderStatus = 'pending'
      }

      const shippingObj = {
        carrier: carrier || undefined,
        shipBy: ebayShipBy(o),
        deliveredAt: (orderStatus === 'delivered' && maxEstimatedDelivery) ? maxEstimatedDelivery : undefined,
      }

      return {
        externalOrderId: o.orderId,
        hasFulfillment,
        placedAt: new Date(o.creationDate),
        status: orderStatus,
        shipping: shippingObj,
        returns: orderReturns,
        buyer: {
          name: fullName,
          username,
          email,
          phone,
        },
        shippingAddress: address,
        totals: {
          total: parseFloat(o.pricingSummary?.total?.value || 0),
          currency: o.pricingSummary?.total?.currency || 'USD',
        },
        items: (o.lineItems || []).map((li) => {
          const rawSku = li.sku && !/^none$/i.test(String(li.sku).trim()) ? String(li.sku).trim() : ''
          const extId = li.legacyItemId ? String(li.legacyItemId) : undefined
          const cleanSku = ebaySku(rawSku, extId)
          return {
            sku: cleanSku,
            rawSku,
            externalListingId: extId,
            lineItemId: li.lineItemId ? String(li.lineItemId) : undefined,
            title: li.title,
            quantity: li.quantity,
            unitPrice: parseFloat(li.lineItemCost?.value || 0),
          }
        }),
      }
    })
    await attachEbayTracking(shop, token, service, rawOrders)
    complete = res.complete
  return { rawOrders, complete }
}

/** Images for an order item whose product has none: Browse API first, then the seller's own GetItem. */
async function orderItemImages(service, { appToken: tokenToUse, token }, item) {
  const itemImages = []
  if (!tokenToUse || typeof service.getItemDetails !== 'function') return itemImages
  try {
    const details = await service.getItemDetails(tokenToUse, item.externalListingId || item.rawSku || item.sku)
    if (details) {
      if (details.image?.imageUrl) itemImages.push(details.image.imageUrl)
      if (Array.isArray(details.additionalImages)) {
        for (const ai of details.additionalImages) {
          if (ai.imageUrl && !itemImages.includes(ai.imageUrl)) {
            itemImages.push(ai.imageUrl)
          }
        }
      }
    }
  } catch {}
  // The Browse API can't see ended or out-of-stock items; the seller's own GetItem can.
  if (!itemImages.length && item.externalListingId && token && typeof service.getListingDetail === 'function') {
    try {
      const detail = await service.getListingDetail(token, item.externalListingId)
      itemImages.push(...(detail?.images || []))
    } catch {}
  }
  return itemImages
}

/**
 * eBay listings in few calls. Every run reads the listing pages (id, SKU, title, price, stock),
 * which is all that changes day to day. Full details (description, images, specifics) are read
 * with GetItem only for listings we have never imported and for the ones not refreshed in a day.
 * Returns `seenIds` (every id eBay listed) so a listing whose detail call failed is never
 * mistaken for an ended one; `complete` is false if any listing page could not be read.
 */
async function fetchEbayListings(manager, shop, token, service) {
  const DETAIL_STALE_MS = 24 * 60 * 60 * 1000
  const NEW_PER_RUN = 60
  const STALE_PER_RUN = 20
  const { items: summaries, complete } = await service.getListingSummaries(token)

  const aliasOf = new Map()
  for (const row of summaries) for (const alias of listingAliases(row.itemId)) aliasOf.set(alias, row.itemId)
  const known = await Listing.find({ shopId: shop._id, externalListingId: { $in: [...aliasOf.keys()] } })
    .select('externalListingId detailSyncedAt').lean()
  const detailedAt = new Map()
  for (const row of known) {
    const id = aliasOf.get(row.externalListingId) || aliasOf.get(productKey(row.externalListingId))
    if (id) detailedAt.set(id, row.detailSyncedAt ? new Date(row.detailSyncedAt).getTime() : 0)
  }
  const needsPrice = (row) => !Number.isFinite(row.price) || !Number.isFinite(row.stock)
  const isNew = summaries.filter((row) => !detailedAt.has(row.itemId))
  const stale = summaries
    .filter((row) => detailedAt.has(row.itemId) && (needsPrice(row) || Date.now() - detailedAt.get(row.itemId) > DETAIL_STALE_MS))
    .sort((a, b) => detailedAt.get(a.itemId) - detailedAt.get(b.itemId))
  const toFetch = [...isNew.slice(0, NEW_PER_RUN), ...stale.slice(0, STALE_PER_RUN)]

  const details = new Map()
  const queue = [...toFetch]
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift()
      try {
        const detail = await service.getListingDetail(token, row.itemId)
        if (detail) details.set(row.itemId, detail)
      } catch (err) {
        console.warn(`[ebay sync] ${shop.name}: could not read item ${row.itemId}: ${err.message}`)
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])

  const items = []
  for (const row of summaries) {
    const detail = details.get(row.itemId)
    // A listing we have never imported needs its details; skip it for now (it counts as seen).
    if (!detail && !detailedAt.has(row.itemId)) continue
    const source = detail || row
    const rawSku = source.sku || ''
    const cleanSku = ebaySku(rawSku, row.itemId)
    const price = Number.isFinite(source.price) && source.price > 0 ? source.price : row.price
    const stock = Number.isFinite(source.stock) ? source.stock : row.stock
    items.push({
      sku: cleanSku,
      aliases: [row.itemId, `item-${row.itemId}`, `EBAY-${row.itemId}`, ...(rawSku ? [rawSku, `item-${rawSku}`] : [])],
      matchSkus: [cleanSku, rawSku, row.itemId, `EBAY-${row.itemId}`].filter(Boolean),
      externalListingId: row.itemId,
      title: source.title || row.title,
      subtitle: detail?.subtitle,
      description: detail?.description,
      price,
      stock,
      variants: detail?.variants,
      images: detail?.images,
      category: detail?.category,
      brand: detail?.brand,
      mpn: detail?.mpn,
      conditionDescription: detail?.conditionDescription,
      dispatchTimeMax: detail?.dispatchTimeMax,
      identifierCode: detail?.identifierCode,
      bestOffer: detail?.bestOffer,
      shipping: detail?.shipping,
      attributes: detail?.specifics,
      listingStatus: 'live',
      marketplaceStatus: source.listingStatus || 'Active',
      listingUrl: source.url || row.url || `https://www.ebay.com/itm/${row.itemId}`,
      detailed: Boolean(detail),
    })
  }
  return { complete, items, seenIds: summaries.map((row) => row.itemId) }
}

/** Connects the eBay shop straight from EBAY_ACCESS_TOKEN in .env, when it is set. */
async function autoConnectFromEnv() {
  if (config.accessToken) {
    await Shop.findOneAndUpdate(
      { marketplace: 'ebay' },
      {
        name: 'eBay Store',
        marketplace: 'ebay',
        externalShopId: 'ebay-live-store',
        status: 'connected',
        auth: {
          accessTokenEnc: config.accessToken,
        },
        lastSyncAt: new Date(),
      },
      { upsert: true, new: true },
    )
  }
}

/** eBay sales need a picture and at least one listing ID: default to every live listing. */
async function promotionTargets(manager, shop, listingIds) {
  let finalListingIds = listingIds
  let imageUrl
  const pickHttpsImage = (rows) => {
    for (const row of rows) {
      const hit = manager.publicImageUrls(row?.productId?.images || []).find((u) => /^https:\/\//i.test(u))
      if (hit) return hit
    }
    return undefined
  }
  if (!finalListingIds.length) {
    const liveListings = await Listing.find({
      shopId: shop._id,
      status: 'live',
      externalListingId: { $exists: true, $nin: ['', null] },
    }).select('externalListingId productId').populate('productId', 'images').limit(500).lean()
    finalListingIds = liveListings
      .map((row) => String(row.externalListingId || '').replace(/^(ebay-)?item-/, ''))
      .filter(Boolean)
    imageUrl = pickHttpsImage(liveListings)
  } else {
    const aliasIds = finalListingIds.flatMap((id) => [id, `item-${id}`, `ebay-item-${id}`])
    const matchedListings = await Listing.find({ shopId: shop._id, externalListingId: { $in: aliasIds } })
      .populate('productId', 'images').lean()
    imageUrl = pickHttpsImage(matchedListings)
    if (!imageUrl) {
      const fallbackListings = await Listing.find({ shopId: shop._id, status: 'live' })
        .populate('productId', 'images').limit(20).lean()
      imageUrl = pickHttpsImage(fallbackListings)
    }
  }
  return { listingIds: finalListingIds, imageUrl }
}

/**
 * After publishing: a product still on a draft SKU (BOT-, EP-, EBAY-yymmdd-xxxxxx) takes
 * EBAY-<item ID>, the format every other eBay product uses. Returns the new SKU or null.
 */
function publishedSku(product, publishRes) {
  const sku = product?.sku
  const isDraft = sku && (sku.startsWith('BOT-') || /^EBAY-\d{6}-[A-F0-9]{6}$/i.test(sku) || sku.startsWith('EP-'))
  return isDraft && publishRes?.externalListingId ? `EBAY-${publishRes.externalListingId}` : null
}

/** A Product Discovery find shaped for this shop (title rules and length). */
const { researchListing } = require('./researchListing')

module.exports = {
  ebayShipBy,
  publishedSku,
  promotionTargets,
  listingVariants,
  shippingLineItems,
  fetchOrders,
  orderAppToken,
  orderItemImages,
  fetchListings: fetchEbayListings,
  autoConnectFromEnv,
  researchListing,
}
