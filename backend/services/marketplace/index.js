/**
 * Unified Marketplace Manager
 * Single interface for eBay, TikTok Shop, and Temu operations
 */

const ebay = require('./ebay')
const tiktokShop = require('./tiktok')
const temu = require('./temu')
const profiles = require('./profiles')
const config = require('../../config/marketplaces')
const Order = require('../../models/Order')
const Customer = require('../../models/Customer')
const SyncLog = require('../../models/SyncLog')
const Shop = require('../../models/Shop')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')
const InventoryLog = require('../../models/InventoryLog')
const IgnoredListing = require('../../models/IgnoredListing')
const Conversation = require('../../models/Conversation')
const Message = require('../../models/Message')
const { saveCustomerStats } = require('../customerStats')
const { listingUrl } = require('../../utils/listingUrl')
const { newSku, ebaySku, isMachineSku } = require('../../utils/sku')

const marketplaceServices = {
  ebay,
  tiktok_shop: tiktokShop,
  temu,
}

function productKey(id) {
  return String(id || '').split(':')[0]
}

function listingAliases(id) {
  const value = String(id || '')
  const key = productKey(value)
  return [...new Set([value, key].filter(Boolean))]
}

function ignoreTokens(...values) {
  const tokens = new Set()
  for (const value of values.flat()) {
    const text = String(value || '').trim()
    if (!text) continue
    tokens.add(text)
    tokens.add(text.toLowerCase())
    for (const part of text.split(':')) {
      const piece = part.trim()
      if (!piece) continue
      tokens.add(piece)
      tokens.add(piece.toLowerCase())
    }
  }
  return [...tokens]
}

class UnifiedMarketplaceManager {
  getService(marketplace) {
    const service = marketplaceServices[marketplace]
    if (!service) {
      throw new Error(`Unsupported marketplace: ${marketplace}`)
    }
    return service
  }

  getConfig(marketplace) {
    return config[marketplace]
  }

  /**
   * Generates authorization redirect URL for a given marketplace
   */
  getAuthUrl(marketplace, state) {
    const service = this.getService(marketplace)
    if (typeof service.getAuthUrl !== 'function') {
      throw new Error(`OAuth connect is not supported via URL for ${marketplace}`)
    }
    return service.getAuthUrl(state)
  }

  /**
   * Exchanges an authorization code for access credentials
   */
  async exchangeCode(marketplace, code) {
    const service = this.getService(marketplace)
    return service.exchangeCode(code)
  }

  /**
   * Refreshes access tokens for a given marketplace
   */
  async refreshToken(marketplace, refreshToken) {
    const service = this.getService(marketplace)
    return service.refreshToken(refreshToken)
  }

  /**
   * Publishes a product listing to the respective marketplace API
   */
  async publishListing(shop, product, options = {}) {
    const service = this.getService(shop.marketplace)
    const images = this.publicImageUrls(options.images?.length ? options.images : product.images)
    try {
      return await this.withShopToken(shop, (token) => service.createListing(token, product, { ...options, images, shop }))
    } catch (err) {
      if (err.notConnected) {
        throw new Error(`Shop "${shop.name}" is not connected. Connect it again from Settings.`)
      }
      throw err
    }
  }

  /** Marketplaces fetch images themselves, so uploaded files need the site's public address. */
  publicImageUrls(images = []) {
    const base = (process.env.PUBLIC_URL || (process.env.CLIENT_URL || '').split(',')[0] || '').trim().replace(/\/$/, '')
    return images
      .map((url) => String(url || '').trim())
      .filter(Boolean)
      .map((url) => (url.startsWith('/') && base ? `${base}${url}` : url))
      .filter((url) => /^https?:\/\//i.test(url))
  }

  /**
   * Pushes stock updates to a connected marketplace
   */
  async pushStock(shop, { sku, quantity, externalListingId }) {
    const service = this.getService(shop.marketplace)
    return this.withShopToken(shop, (token) => service.updateStock(token, sku, quantity, { shop, externalListingId }))
  }

  /**
   * Pushes shipping fulfillment & tracking number to eBay
   */
  async pushShipping(order, { carrier, trackingNumber }) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { pushed: false, note: 'Shop not connected or credentials not present' }
    }

    const service = this.getService(shop.marketplace)
    if (typeof service.createShippingFulfillment !== 'function') {
      return { pushed: false, note: `${shop.marketplace} shipping push is not available` }
    }

    await this.withShopToken(shop, async (token) => {
      let lineItems = (order.items || [])
        .filter((item) => item.lineItemId)
        .map((item) => ({ lineItemId: item.lineItemId, quantity: item.quantity }))
      // Orders imported before line-item IDs were stored: read them from eBay.
      if (shop.marketplace === 'ebay' && lineItems.length !== (order.items || []).length) {
        const remote = await service.getOrder(token, order.externalOrderId)
        lineItems = (remote.lineItems || []).map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity }))
      }
      return service.createShippingFulfillment(token, order.externalOrderId, { carrier, trackingNumber, lineItems, shop })
    })
    return { pushed: true }
  }

  /**
   * All eBay orders changed since the last complete sync (everything eBay still returns on the
   * first run), read page by page. `complete` is false if the page cap was hit, so the sync
   * cursor is not advanced and the remainder is picked up next time.
   */
  async fetchEbayOrders(shop, token, service) {
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
  async attachEbayTracking(shop, token, service, rawOrders) {
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

  /**
   * Synchronizes and imports orders from a marketplace store
   */
  async syncOrdersForShop(shop) {
    const syncLog = await SyncLog.create({
      shopId: shop._id,
      type: 'orders',
      status: 'success',
      startedAt: new Date(),
    })

    const token = shop._id ? await this.freshToken(shop) : shop.auth?.accessTokenEnc || ''
    if (!token) {
      syncLog.status = 'partial'
      syncLog.finishedAt = new Date()
      syncLog.error = { message: 'Shop does not have an active access token; skipping live sync.' }
      await syncLog.save()
      return { synced: 0, reason: 'No active access token' }
    }

    let rawOrders = []
    const syncStartedAt = new Date()
    let ordersComplete = true
    try {
      const service = this.getService(shop.marketplace)
      let updatedCount = 0
      if (shop.marketplace === 'ebay') {
        const [res, rawCancellations, rawReturns] = await Promise.all([
          this.fetchEbayOrders(shop, token, service),
          typeof service.getCancellations === 'function' ? service.getCancellations(token).catch(() => []) : [],
          typeof service.getReturns === 'function' ? service.getReturns(token).catch(() => []) : [],
        ])

        const cancelledOrderIds = new Set()
        for (const c of rawCancellations || []) {
          const cStatus = String(c.cancelStatus || '').toUpperCase()
          if (!cStatus.includes('REJECT')) {
            if (c.orderId) cancelledOrderIds.add(String(c.orderId))
            if (c.legacyOrderId) cancelledOrderIds.add(String(c.legacyOrderId))
          }
        }

        const returnedOrderMap = new Map()
        for (const r of rawReturns || []) {
          if (r.orderId) returnedOrderMap.set(String(r.orderId), r)
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
            (cancelState.startsWith('CANCEL') && !cancelState.includes('REJECTED') && !cancelState.includes('NONE'))

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
        await this.attachEbayTracking(shop, token, service, rawOrders)
        ordersComplete = res.complete
      } else {
        const res = await service.getOrders(token, { limit: 50, shop })
        rawOrders = res.orders || []
      }

      let createdCount = 0
      const touchedCustomerIds = []
      let appToken = null
      if (shop.marketplace === 'ebay' && typeof service.getApplicationToken === 'function') {
        try {
          appToken = await service.getApplicationToken()
        } catch {}
      }

      for (const ord of rawOrders) {
        let customer = null
        const buyerUsername = ord.buyer?.username || ord.buyer?.name
        if (buyerUsername) {
          customer = await Customer.findOne({
            $or: [
              { 'identities.externalBuyerId': buyerUsername },
              { 'identities.username': buyerUsername },
              { name: buyerUsername },
              ...(ord.buyer.name ? [{ name: ord.buyer.name }] : []),
            ],
          })
          if (!customer) {
            customer = await Customer.create({
              name: ord.buyer.name || buyerUsername,
              email: ord.buyer.email || undefined,
              phone: ord.buyer.phone || undefined,
              address: ord.shippingAddress,
              addresses: ord.shippingAddress?.city ? [ord.shippingAddress] : [],
              identities: [
                {
                  shopId: shop._id,
                  marketplace: shop.marketplace,
                  externalBuyerId: buyerUsername,
                  username: buyerUsername,
                },
              ],
            })
          } else {
            let changed = false
            if (ord.buyer.name && ord.buyer.name !== buyerUsername && customer.name === buyerUsername) {
              customer.name = ord.buyer.name
              changed = true
            }
            if (!customer.phone && ord.buyer.phone) {
              customer.phone = ord.buyer.phone
              changed = true
            }
            if ((!customer.email || !customer.email.includes('@')) && ord.buyer.email) {
              customer.email = ord.buyer.email
              changed = true
            }
            if (!customer.address?.city && ord.shippingAddress?.city) {
              customer.address = ord.shippingAddress
              customer.addresses = [ord.shippingAddress]
              changed = true
            }
            const hasId = (customer.identities || []).some(
              (i) => i.shopId?.toString() === shop._id.toString() && (i.externalBuyerId === buyerUsername || i.username === buyerUsername),
            )
            if (!hasId) {
              customer.identities = customer.identities || []
              customer.identities.push({
                shopId: shop._id,
                marketplace: shop.marketplace,
                externalBuyerId: buyerUsername,
                username: buyerUsername,
              })
              changed = true
            }
            if (changed) {
              await customer.save()
            }
          }
          if (customer?._id) touchedCustomerIds.push(customer._id)
        }

        // Ensure catalog products and listings exist for ordered items
        for (const item of ord.items || []) {
          if (!item.sku && !item.externalListingId) continue

          let prod = null

          // 1. If listing already exists on this shop, reuse its existing product
          if (item.externalListingId) {
            const existingListing = await Listing.findOne({ shopId: shop._id, externalListingId: item.externalListingId })
            if (existingListing?.productId) {
              prod = await Product.findById(existingListing.productId)
            }
          }

          // 2. If still not found, check product collection by normalized SKU and all aliases
          if (!prod) {
            const candidates = [
              item.sku,
              item.rawSku,
              item.externalListingId,
              item.externalListingId ? `EBAY-${item.externalListingId}` : null,
              item.externalListingId ? `TTS-${item.externalListingId}` : null,
            ].filter(Boolean)
            prod = await Product.findOne({ sku: { $in: candidates } })
          }

          let itemImages = []
          if (!prod || !prod.images || prod.images.length === 0) {
            const tokenToUse = appToken || token
            if (shop.marketplace === 'ebay' && tokenToUse && typeof service.getItemDetails === 'function') {
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
            }
          }

          if (!prod) {
            prod = await Product.create({
              sku: item.sku || (item.externalListingId ? `EBAY-${item.externalListingId}` : newSku(shop.marketplace)),
              title: item.title || `Item ${item.sku || item.externalListingId}`,
              category: 'General',
              brand: shop.name || 'Store item',
              images: itemImages,
              basePrice: item.unitPrice || undefined,
              stock: 0,
              status: 'active',
              source: 'marketplace_sync',
            })
          } else if (itemImages.length > 0 && (!prod.images || prod.images.length === 0)) {
            prod.images = itemImages
            await prod.save()
          }
          item.productId = prod._id

          // Links the product to its listing; match on externalListingId to prevent duplicate listings
          if (item.externalListingId) {
            await Listing.updateOne(
              { shopId: shop._id, externalListingId: item.externalListingId },
              {
                $setOnInsert: {
                  productId: prod._id,
                  shopId: shop._id,
                  marketplace: shop.marketplace,
                  externalListingId: item.externalListingId,
                  price: item.unitPrice || prod.basePrice,
                  status: 'pending',
                  lastSyncedAt: new Date(),
                },
              },
              { upsert: true },
            )
          }
        }

        const existing = await Order.findOne({ shopId: shop._id, externalOrderId: ord.externalOrderId })
        if (existing) {
          // If the order was already marked as cancelled or refunded in our system,
          // never regress it back to 'paid', 'pending', or 'processing'
          if (['cancelled', 'refunded', 'shipped', 'delivered'].includes(existing.status) && ['paid', 'pending', 'processing'].includes(ord.status)) {
            // Keep the status we already have: eBay has no shipment yet (or the tracking push is
            // still pending), and a cancelled/refunded order must not come back to life.
          } else {
            existing.status = ord.status
          }
          if (!existing.customerId && customer?._id) existing.customerId = customer._id
          if (ord.buyer?.name && (!existing.buyer?.name || existing.buyer?.name === 'eBay Customer')) {
            existing.buyer = { ...existing.buyer, name: ord.buyer.name }
          }
          if (ord.buyer?.username && !existing.buyer?.username) {
            existing.buyer = { ...existing.buyer, username: ord.buyer.username }
          }
          if (ord.buyer?.phone && !existing.buyer?.phone) {
            existing.buyer = { ...existing.buyer, phone: ord.buyer.phone }
          }
          if (ord.buyer?.email && (!existing.buyer?.email || !existing.buyer?.email.includes('@'))) {
            existing.buyer = { ...existing.buyer, email: ord.buyer.email }
          }
          // Orders imported before line-item IDs were stored get them now.
          if ((ord.items || []).length === existing.items.length) {
            existing.items.forEach((item, i) => {
              if (!item.lineItemId && ord.items[i]?.lineItemId) item.lineItemId = ord.items[i].lineItemId
            })
          }
          if (ord.shippingAddress && !existing.shippingAddress) {
            existing.shippingAddress = ord.shippingAddress
          }
          if (ord.shipping) {
            const prev = existing.shipping?.toObject?.() || existing.shipping || {}
            existing.shipping = ord.shipping.trackingVerified
              // The marketplace's own shipment record replaces whatever was stored before.
              ? {
                  ...prev,
                  carrier: ord.shipping.carrier || prev.carrier,
                  trackingNumber: ord.shipping.trackingNumber,
                  shippedAt: ord.shipping.shippedAt || prev.shippedAt,
                  deliveredAt: ord.shipping.deliveredAt || prev.deliveredAt,
                  trackingVerified: true,
                }
              : {
                  ...prev,
                  carrier: ord.shipping.carrier || prev.carrier,
                  trackingNumber: prev.trackingNumber || ord.shipping.trackingNumber,
                  shippedAt: prev.shippedAt || ord.shipping.shippedAt,
                  deliveredAt: ord.shipping.deliveredAt || prev.deliveredAt,
                }
          }
          if (Array.isArray(ord.returns) && ord.returns.length > 0) {
            existing.returns = ord.returns
          }
          await existing.save()
          updatedCount++
        } else {
          const newOrder = await Order.create({
            ...ord,
            shopId: shop._id,
            marketplace: shop.marketplace,
            customerId: customer?._id || null,
          })
          createdCount++

          const soldProductIds = new Set()
          // Deduct stock for newly imported order. Not for orders that arrive already cancelled or
          // refunded, and not for eBay sales the last listing sync already counted (eBay's own
          // stock fell when the item sold, and listing sync copies that number).
          for (const item of ord.items || []) {
            if (['cancelled', 'refunded'].includes(ord.status)) break
            if (item.productId && item.quantity > 0) {
              try {
                const own = await Listing.findOne({ shopId: shop._id, productId: item.productId }).select('lastSyncedAt stock').lean()
                if (own?.lastSyncedAt && ord.placedAt && new Date(own.lastSyncedAt) > new Date(ord.placedAt)) continue
                const prod = await Product.findById(item.productId)
                if (prod && prod.stock > 0) {
                  const stockBefore = prod.stock
                  const stockAfter = Math.max(0, prod.stock - item.quantity)
                  await Product.findByIdAndUpdate(item.productId, { $set: { stock: stockAfter } })
                  // This shop's own stock fell by the sold quantity; its next listing sync then sees
                  // no change. The other shops are brought down by propagateStock below.
                  if (own && Number.isFinite(own.stock)) {
                    const shopStock = Math.max(0, own.stock - item.quantity)
                    await Listing.updateOne(
                      { shopId: shop._id, productId: item.productId },
                      { $set: { stock: shopStock, ...(shopStock === 0 ? { status: 'out_of_stock' } : {}) } },
                    )
                  }
                  soldProductIds.add(String(item.productId))
                  await InventoryLog.create({
                    productId: item.productId,
                    shopId: shop._id,
                    stockBefore,
                    stockAfter,
                    change: -item.quantity,
                    reason: 'sale',
                    refId: newOrder._id,
                  })
                }
              } catch (logErr) {
                console.warn('[syncOrders] Failed to deduct stock for order item:', logErr.message)
              }
            }
          }
          // A sale here lowers the shared stock; tell the other shops that sell the same product.
          for (const productId of soldProductIds) {
            const sold = await Product.findById(productId)
            if (sold) await this.propagateStock(sold, { exceptShopId: shop._id })
          }
        }
      }

      await saveCustomerStats(touchedCustomerIds)

      await Shop.updateOne({ _id: shop._id }, {
        lastSyncAt: new Date(),
        ...(shop.marketplace === 'ebay' && ordersComplete ? { ordersSyncedAt: syncStartedAt } : {}),
      })

      syncLog.stats = {
        fetched: rawOrders.length,
        created: createdCount,
        updated: updatedCount,
        failed: 0,
      }
      syncLog.finishedAt = new Date()
      await syncLog.save()

      return {
        synced: rawOrders.length,
        created: createdCount,
        updated: updatedCount,
      }
    } catch (err) {
      syncLog.status = 'failed'
      syncLog.finishedAt = new Date()
      syncLog.error = { message: err.message }
      await syncLog.save()
      throw err
    }
  }

  /**
   * Pushes price update to marketplace
   */
  async pushPrice(shop, { sku, price, externalListingId }) {
    const service = this.getService(shop.marketplace)
    return this.withShopToken(shop, (token) => service.updatePrice(token, sku, price, 'USD', { shop, externalListingId }))
  }

  /**
   * Looks up categories via eBay Taxonomy API
   */
  async getCategories(shop, query = 'General') {
    const service = this.getService(shop.marketplace)
    if (typeof service.getCategories !== 'function') return []
    return this.withShopToken(shop, (token) => service.getCategories(token, query, { shop }))
  }

  /**
   * Re-checks which sections the shop's token can reach and saves the result on the shop.
   * Returns the saved `apiAccess` map.
   */
  async checkShopAccess(shop) {
    const access = await this.withShopToken(shop, (token) => profiles.probeSections(shop.marketplace, token, shop))
    const checkedAt = new Date()
    await Shop.updateOne({ _id: shop._id }, { apiAccess: access, apiAccessCheckedAt: checkedAt })
    shop.apiAccess = access
    shop.apiAccessCheckedAt = checkedAt
    return access
  }

  /** Profiles for every marketplace, each with its connected shop's section access. */
  async shopProfiles(shops, { refresh = false } = {}) {
    const result = []
    for (const marketplace of Object.keys(profiles.PROFILES)) {
      const shop = shops.find((item) => item.marketplace === marketplace && item.status === 'connected')
        || shops.find((item) => item.marketplace === marketplace)
      if (shop?.status === 'connected') {
        const syncQueue = require('../syncQueue')
        const stale = !shop.apiAccessCheckedAt || Date.now() - new Date(shop.apiAccessCheckedAt).getTime() > profiles.ACCESS_TTL_MS
        if (refresh || !shop.apiAccess) {
          const access = await syncQueue.enqueue('access', shop._id, { wait: true, timeoutMs: 30000 })
          if (access && !access.error && !access.queued && !access.skipped) {
            shop.apiAccess = access
            shop.apiAccessCheckedAt = new Date()
          }
        } else if (stale) {
          syncQueue.enqueue('access', shop._id).catch((err) => console.warn(`Access check failed for ${shop.name}:`, err.message))
        }
      }
      result.push({ ...profiles.describe(marketplace, shop), shopId: shop?._id || null, shopName: shop?.name || null })
    }
    return result
  }

  /** What each marketplace's listing API supports, so the List dialog can show the right fields. */
  listingCapabilities(marketplace) {
    return marketplaceServices[marketplace]?.listingCapabilities || { canList: false, editAfterListing: [] }
  }

  /**
   * Pause, publish, end, relist or delete a listing using that shop's API.
   * Returns the fields to save on the listing document.
   */
  async applyListingAction(shop, listing, action, options = {}) {
    const allowed = (profiles.PROFILES[shop.marketplace]?.listingActions || []).some((item) => {
      if (item.id !== action) return false
      if (listing.marketplaceStatus && item.raw?.includes(listing.marketplaceStatus)) return true
      return item.statuses.includes(listing.status)
    })
    if (!allowed) throw new Error(`This ${shop.marketplace === 'ebay' ? 'eBay' : 'shop'} listing cannot ${action} in its current state.`)
    const service = this.getService(shop.marketplace)
    if (typeof service.applyListingAction !== 'function') throw new Error(`Listing actions are not available for ${shop.name}.`)
    return this.withShopToken(shop, (token) => service.applyListingAction(token, action, listing, { ...options, shop }))
  }

  /**
   * Removes the shop listing when the catalog product is deleted.
   * On TikTok, delete sets status DELETED.
   * On eBay, delete ends the listing via EndFixedPriceItem so it is no longer on sale.
   */
  async removeFromShop(shop, listing) {
    if (!shop || !listing?.externalListingId) return
    if (listing.marketplaceStatus === 'DELETED' || listing.status === 'ended') return
    const service = this.getService(shop.marketplace)
    if (typeof service.applyListingAction !== 'function') return
    await this.withShopToken(shop, (token) => service.applyListingAction(token, 'delete', listing, { shop })).catch((err) => {
      console.warn(`Failed to remove listing ${listing.externalListingId} from ${shop.name}:`, err.message)
    })
  }

  /** Keeps a removed shop product from being imported again. */
  async forgetListing(listing, extras = []) {
    const shopId = listing?.shopId
    if (!shopId) return
    const id = listing?.externalListingId
    const aliasList = id ? [id, `item-${id}`, `EBAY-${id}`] : []
    for (const productKey of ignoreTokens(id, aliasList, extras)) {
      await IgnoredListing.updateOne(
        { shopId, productKey },
        { $setOnInsert: { shopId, productKey } },
        { upsert: true },
      )
    }
  }

  /** A new publish of the same SKU should sync again. */
  async rememberListing(shopId, tokens) {
    const keys = ignoreTokens(tokens)
    if (!shopId || !keys.length) return
    await IgnoredListing.deleteMany({ shopId, productKey: { $in: keys } })
  }

  async isForgotten(shopId, item, product) {
    const tokens = ignoreTokens(item?.externalListingId, item?.sku, item?.aliases, item?.matchSkus, product?.sku)
    if (!shopId || !tokens.length) return false
    const rows = await IgnoredListing.find({ shopId, productKey: { $in: tokens } }).select('_id').limit(1).lean()
    if (rows.length) return true
    const folded = new Set(tokens.map((token) => token.toLowerCase()))
    const stored = await IgnoredListing.find({ shopId }).select('productKey').lean()
    return stored.some((row) => folded.has(String(row.productKey || '').toLowerCase()))
  }

  /**
   * Looks up category attribute schema via eBay Taxonomy API
   */
  async getCategoryAttributes(shop, categoryId) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getItemAspects !== 'function') return []
    return this.withShopToken(shop, (token) => service.getItemAspects(token, categoryId, { shop }))
  }

  /** Extra category requirements, such as TikTok certifications. */
  async getCategoryRules(shop, categoryId) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getCategoryRules !== 'function') return []
    return this.withShopToken(shop, (token) => service.getCategoryRules(token, categoryId, { shop }))
  }

  /**
   * Processes refunds/returns across marketplaces
   */
  async processRefund(order, { reason, comment, amount }) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { success: false, note: 'Shop not connected or credentials missing' }
    }
    const service = this.getService(shop.marketplace)
    if (typeof service.issueRefund !== 'function') {
      return { success: false, note: `${shop.marketplace} refunds are not available from this connector` }
    }
    return this.withShopToken(shop, (token) => service.issueRefund(token, order.externalOrderId, { reason, comment, amount, shop }))
  }

  /**
   * Cancels unfulfilled order across marketplaces
   */
  async cancelOrder(order, { reason = 'OUT_OF_STOCK', comment = '' } = {}) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { success: false, note: 'Shop not connected or credentials missing' }
    }
    const service = this.getService(shop.marketplace)
    if (typeof service.cancelOrder !== 'function') {
      return { success: false, note: `${shop.marketplace} order cancellation is not supported via API` }
    }
    return this.withShopToken(shop, (token) => service.cancelOrder(token, order.externalOrderId, { reason, comment, shop }))
  }

  /** Recent transactions and fees from the marketplace's finance API. */
  async getFinances(shop) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getFinances !== 'function') return { transactions: [], total: 0 }
    return this.withShopToken(shop, (token) => service.getFinances(token, { shop }))
  }

  /**
   * Automatically initializes and connects shop if direct token is present in .env
   */
  async autoConnectFromEnv() {
    if (config.ebay?.accessToken) {
      await Shop.findOneAndUpdate(
        { marketplace: 'ebay' },
        {
          name: 'eBay Store',
          marketplace: 'ebay',
          externalShopId: 'ebay-live-store',
          status: 'connected',
          auth: {
            accessTokenEnc: config.ebay.accessToken,
          },
          lastSyncAt: new Date(),
        },
        { upsert: true, new: true },
      )
    }
  }

  /**
   * eBay listings in few calls. Every run reads the listing pages (id, SKU, title, price, stock),
   * which is all that changes day to day. Full details (description, images, specifics) are read
   * with GetItem only for listings we have never imported and for the ones not refreshed in a day.
   * Returns `seenIds` (every id eBay listed) so a listing whose detail call failed is never
   * mistaken for an ended one; `complete` is false if any listing page could not be read.
   */
  async fetchEbayListings(shop, token, service) {
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
        description: detail?.description,
        price,
        stock,
        images: detail?.images,
        category: detail?.category,
        brand: detail?.brand,
        attributes: detail?.specifics,
        listingStatus: 'live',
        marketplaceStatus: source.listingStatus || 'Active',
        listingUrl: source.url || row.url || `https://www.ebay.com/itm/${row.itemId}`,
        detailed: Boolean(detail),
      })
    }
    return { complete, items, seenIds: summaries.map((row) => row.itemId) }
  }

  /** Listings as they are on the marketplace right now, in one shape for every shop. */
  async fetchShopListings(shop, token) {
    const service = this.getService(shop.marketplace)
    if (shop.marketplace === 'ebay') return this.fetchEbayListings(shop, token, service)
    if (typeof service.getInventory !== 'function') return { complete: false, items: [] }
    const res = await service.getInventory(token, { limit: 200, shop })
    const items = res.inventoryItems || []
    return {
      complete: res.complete ?? items.length < 200,
      items: items.map((item) => ({
        ...item,
        aliases: listingAliases(item.externalListingId),
        matchSkus: [item.sku].filter((sku) => sku && !/^none$/i.test(sku)),
        listingStatus: item.listingStatus || 'live',
      })),
    }
  }

  /**
   * Pulls listings from the marketplace. The marketplace wins: title, description, price, stock
   * and images edited on eBay or TikTok overwrite the dashboard copy. Listings that are gone
   * from the marketplace are marked ended.
   */
  async syncListingsForShop(shop) {
    let fetched
    try {
      fetched = await this.withShopToken(shop, (token) => this.fetchShopListings(shop, token))
    } catch (err) {
      console.warn(`Listing sync failed for shop ${shop.name}:`, err.message)
      return { productsImported: 0, listingsLinked: 0, error: err.message }
    }

    let createdProducts = 0
    let updatedListings = 0
    const seenListingIds = []
    const failures = []
    for (const item of fetched.items) {
      if (!item.externalListingId) continue
      seenListingIds.push(item.externalListingId)
      try {
        const { created } = await this.saveSyncedListing(shop, item)
        if (created) createdProducts++
        updatedListings++
      } catch (err) {
        failures.push(`${item.externalListingId}: ${err.message}`)
      }
    }

    let ended = 0
    for (const id of fetched.seenIds || []) seenListingIds.push(id)
    // An empty answer for a shop that has live listings is treated as a failed read, not as
    // "everything ended"; ending listings needs a real, complete list.
    let complete = fetched.complete
    if (complete && !seenListingIds.length) {
      const live = await Listing.countDocuments({ shopId: shop._id, status: { $in: ['live', 'out_of_stock'] } })
      if (live > 0) {
        complete = false
        console.warn(`Listing sync for ${shop.name}: the marketplace returned no listings but ${live} are live here; not ending any.`)
      }
    }
    if (complete) {
      const seen = new Set()
      for (const id of seenListingIds) listingAliases(id).forEach((key) => seen.add(key))
      const cutoff = new Date(Date.now() - 10 * 60 * 1000)
      const candidates = await Listing.find({
        shopId: shop._id,
        status: { $in: ['live', 'out_of_stock', 'pending', 'paused'] },
        externalListingId: { $exists: true, $nin: ['', null] },
        updatedAt: { $lt: cutoff },
      })
      for (const listing of candidates) {
        const keys = listingAliases(listing.externalListingId)
        if (keys.some((key) => seen.has(key))) continue
        listing.status = 'ended'
        listing.syncError = `No longer returned by ${config[shop.marketplace]?.name || shop.marketplace}.`
        listing.lastSyncedAt = new Date()
        await listing.save()
        ended += 1
      }
    }
    if (failures.length) console.warn(`Listing sync for ${shop.name}: ${failures.length} item(s) failed. ${failures.slice(0, 3).join(' | ')}`)
    await Shop.updateOne({ _id: shop._id }, { lastSyncAt: new Date() })
    return { productsImported: createdProducts, listingsLinked: updatedListings, listingsEnded: ended, failed: failures.length }
  }

  /**
   * Applies a shop's stock change to the shared product stock. Only the change since this shop
   * was last read counts (a sale or an edit on that marketplace), so shops never overwrite each
   * other's numbers. The new shared stock is then pushed to the other shops.
   * `was` is the stock last seen on this listing (undefined if it was never read before).
   */
  async reconcileStock(product, listing, shop, was, now) {
    const before = Number(product.stock) || 0
    let stock = before
    let changed = false
    if (!Number.isFinite(was)) {
      const others = await Listing.countDocuments({ productId: product._id, _id: { $ne: listing._id } })
      if (!others) {
        // Only this shop sells it, so the marketplace number is the truth.
        stock = now
        changed = stock !== before
      } else if (now !== stock) {
        // First read of a listing on a product other shops also sell: it adopts the shared stock.
        await this.propagateStock(product, { onlyListingId: listing._id })
        return
      }
    } else if (now !== was) {
      stock = Math.max(0, stock + (now - was))
      changed = true
    }
    if (!changed) return
    product.stock = stock
    await Product.updateOne({ _id: product._id }, { $set: { stock } })
    await InventoryLog.create({
      productId: product._id,
      shopId: shop._id,
      stockBefore: before,
      stockAfter: stock,
      change: stock - before,
      reason: 'sync',
    }).catch(() => {})
    await this.propagateStock(product, { exceptShopId: shop._id })
  }

  /**
   * Pushes the shared product stock to the live listings of the other shops. A listing's stored
   * stock is set before the push (and put back if it fails) so that shop's next sync reads no
   * change and does not count the push as a sale.
   */
  async propagateStock(product, { exceptShopId = null, onlyListingId = null } = {}) {
    const quantity = Math.max(0, Math.floor(Number(product.stock) || 0))
    const filter = { productId: product._id, status: { $in: ['live', 'out_of_stock'] } }
    if (exceptShopId) filter.shopId = { $ne: exceptShopId }
    if (onlyListingId) filter._id = onlyListingId
    const listings = await Listing.find(filter)
    const results = []
    for (const listing of listings) {
      if (listing.stock === quantity) continue
      const shop = await Shop.findById(listing.shopId)
      if (!shop || shop.status !== 'connected') continue
      const before = { stock: listing.stock, status: listing.status }
      listing.stock = quantity
      listing.status = quantity > 0 ? 'live' : 'out_of_stock'
      await listing.save()
      try {
        await this.pushStock(shop, { sku: product.sku, quantity, externalListingId: listing.externalListingId, productId: product._id })
        listing.syncError = null
        await listing.save()
        results.push({ shopName: shop.name, ok: true })
      } catch (err) {
        Object.assign(listing, before, { syncError: `Stock update failed: ${err.message}` })
        await listing.save()
        console.warn(`[stock] ${shop.name}: could not set ${product.sku} to ${quantity}: ${err.message}`)
        results.push({ shopName: shop.name, ok: false, error: err.message })
      }
    }
    return results
  }

  /** Saves one marketplace listing, creating or updating its product. */
  async saveSyncedListing(shop, item) {
    const key = productKey(item.externalListingId)
    const ids = [...new Set([...(item.aliases || []), ...listingAliases(item.externalListingId)])]
    let listing = await Listing.findOne({
      shopId: shop._id,
      $or: [
        { externalListingId: { $in: ids } },
        ...(key && shop.marketplace === 'tiktok_shop' ? [{ externalListingId: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(:|$)`) }] : []),
      ],
    })
    let product = listing ? await Product.findById(listing.productId) : null
    if (!product && item.matchSkus?.length) product = await Product.findOne({ sku: { $in: item.matchSkus } })
    if (await this.isForgotten(shop._id, item, product)) {
      if (product?.source === 'marketplace_sync') {
        const others = await Listing.countDocuments({ productId: product._id, ...(listing ? { _id: { $ne: listing._id } } : {}) })
        if (!others) {
          await Listing.deleteMany({ productId: product._id, shopId: shop._id })
          await Product.deleteOne({ _id: product._id })
        }
      }
      return { created: false, skipped: true }
    }
    // A rejected, draft, or deleted TikTok product is not a new catalog row. Search still returns it.
    if (!listing && ['DELETED', 'FAILED', 'DRAFT'].includes(item.marketplaceStatus)) {
      return { created: false, skipped: true }
    }
    if (listing?.marketplaceStatus === 'DELETED' && !['ACTIVATE', 'SELLER_DEACTIVATED'].includes(item.marketplaceStatus)) {
      return { created: false, skipped: true }
    }

    const fromMarketplace = {
      title: item.title,
      description: item.description,
      basePrice: item.price > 0 ? item.price : undefined,
      stock: Number.isFinite(item.stock) ? item.stock : undefined,
      images: item.images?.length ? item.images : undefined,
      category: item.category,
      brand: item.brand,
    }
    const created = !product
    if (created) {
      product = await Product.create({
        sku: item.sku,
        ...Object.fromEntries(Object.entries(fromMarketplace).filter(([, value]) => value !== undefined && value !== '')),
        title: item.title || `Item ${item.externalListingId}`,
        weight: item.weight || 1,
        dimensions: item.dimensions || undefined,
        attributes: item.attributes || undefined,
        status: item.listingStatus === 'live' ? 'active' : 'draft',
        source: 'marketplace_sync',
      })
    } else {
      for (const [field, value] of Object.entries(fromMarketplace)) {
        // Stock is not copied: a shop's stock only moves the shared stock by what changed on it
        // (see the stock block below), so shops do not overwrite each other.
        if (field === 'stock') continue
        if (value !== undefined && value !== '') product[field] = value
      }
      if (item.weight != null && (product.weight == null || product.weight === 1)) product.weight = item.weight
      if (item.listingStatus === 'live' && product.status === 'draft') product.status = 'active'
      // A made-up SKU (draft or random ID) becomes the real one, if no other product uses it.
      if (isMachineSku(product.sku) && item.sku && !isMachineSku(item.sku) && item.sku !== product.sku
        && !(await Product.exists({ sku: item.sku, _id: { $ne: product._id } }))) {
        product.sku = item.sku
      }
      await product.save()
    }

    if (!listing) listing = await Listing.findOne({ productId: product._id, shopId: shop._id })
    if (!listing && ['DELETED', 'FAILED', 'DRAFT'].includes(item.marketplaceStatus)) {
      if (created) await Product.deleteOne({ _id: product._id })
      return { created: false, skipped: true }
    }
    if (await this.isForgotten(shop._id, item, product)) {
      if (created) await Product.deleteOne({ _id: product._id })
      return { created: false, skipped: true }
    }
    if (!listing) listing = new Listing({ productId: product._id, shopId: shop._id })
    const wasStatus = listing.status
    const wasRaw = listing.marketplaceStatus
    const wasStock = listing.stock
    Object.assign(listing, {
      marketplace: shop.marketplace,
      externalListingId: item.externalListingId,
      price: Number.isFinite(item.price) ? item.price : listing.price,
      stock: Number.isFinite(item.stock) ? item.stock : listing.stock,
      status: item.listingStatus === 'live' && item.stock === 0 ? 'out_of_stock' : item.listingStatus,
      marketplaceStatus: item.marketplaceStatus || undefined,
      listingUrl: item.listingUrl || undefined,
      syncError: item.listingError || null,
      lastSyncedAt: new Date(),
      ...(item.detailed ? { detailSyncedAt: new Date() } : {}),
    })
    await listing.save()
    if (!created && Number.isFinite(item.stock)) await this.reconcileStock(product, listing, shop, wasStock, item.stock)
    const notify = require('../notify')
    await notify.listingStatusChanged(listing, shop, { wasStatus, wasRaw, imported: created }).catch(() => {})
    if (Number.isFinite(item.stock)) {
      await notify.stockChanged(product, shop, { was: wasStock, stock: item.stock }).catch(() => {})
    }
    return { created }
  }

  /**
   * Pushes dashboard edits (title, description, images, price, stock) to every linked
   * listing that is live on its marketplace. Returns one result per listing.
   */
  async pushProductChanges(product, changes) {
    const results = []
    const listings = await Listing.find({ productId: product._id, status: { $in: ['live', 'out_of_stock', 'pending', 'paused'] } })
    for (const listing of listings) {
      const shop = await Shop.findById(listing.shopId)
      if (!shop || shop.status !== 'connected') continue
      const service = this.getService(shop.marketplace)
      if (typeof service.reviseListing !== 'function') continue
      const payload = {
        ...changes,
        ...(changes.images ? { images: this.publicImageUrls(changes.images) } : {}),
      }
      try {
        await this.withShopToken(shop, (token) => service.reviseListing(token, listing.externalListingId, payload, { shop }))
        listing.syncError = null
        if (changes.price != null) listing.price = changes.price
        if (changes.quantity != null) listing.stock = Math.max(0, Math.floor(Number(changes.quantity)))
        if (changes.quantity != null && ['live', 'out_of_stock'].includes(listing.status)) {
          listing.status = Number(changes.quantity) > 0 ? 'live' : 'out_of_stock'
        }
        results.push({ shopName: shop.name, ok: true })
      } catch (err) {
        listing.syncError = err.message
        results.push({ shopName: shop.name, ok: false, error: err.message })
      }
      listing.lastSyncedAt = new Date()
      await listing.save()
    }
    // Ending an eBay listing takes it off sale. Revising stock cannot bring it back;
    // a restock has to relist it.
    if (Number(changes.quantity) > 0) {
      const ended = await Listing.find({ productId: product._id, status: 'ended', marketplace: 'ebay' })
      for (const listing of ended) {
        const shop = await Shop.findById(listing.shopId)
        if (!shop || shop.status !== 'connected') continue
        const service = this.getService(shop.marketplace)
        if (typeof service.relistListing !== 'function') continue
        try {
          const result = await this.withShopToken(shop, (token) => service.relistListing(token, listing.externalListingId, {
            quantity: changes.quantity,
            ...(changes.price != null ? { price: changes.price } : {}),
            ...(changes.title ? { title: changes.title } : {}),
            ...(changes.description ? { description: changes.description } : {}),
          }))
          listing.status = result.status || 'live'
          if (result.externalListingId) listing.externalListingId = result.externalListingId
          listing.listingUrl = listingUrl(shop.marketplace, listing.externalListingId, '')
          listing.marketplaceStatus = 'Active'
          listing.syncError = null
          if (changes.price != null) listing.price = changes.price
          results.push({ shopName: shop.name, ok: true, relisted: true })
        } catch (err) {
          listing.syncError = err.message
          results.push({ shopName: shop.name, ok: false, error: err.message })
        }
        listing.lastSyncedAt = new Date()
        await listing.save()
      }
    }
    return results
  }

  /**
   * Full synchronization for a single shop (both orders & listings)
   */
  async syncAllForShop(shop) {
    const listingsResult = await this.syncListingsForShop(shop).catch((err) => ({ error: err.message }))
    const ordersResult = await this.syncOrdersForShop(shop).catch((err) => ({ error: err.message }))
    return { shopId: shop._id, shopName: shop.name, marketplace: shop.marketplace, orders: ordersResult, listings: listingsResult }
  }

  /** TikTok sends an absolute Unix time; eBay sends seconds from now. */
  tokenExpiry(expiresIn) {
    const value = Number(expiresIn)
    if (!value) return null
    return new Date(value > 1e9 ? value * 1000 : Date.now() + value * 1000)
  }

  /** Current access token, refreshed first when it ends within 10 minutes (or when `force`). */
  async freshToken(shop, { force = false } = {}) {
    const doc = await Shop.findById(shop._id).select('+auth.accessTokenEnc +auth.refreshTokenEnc')
    if (!doc?.auth?.accessTokenEnc) return ''
    const expiresAt = doc.auth.expiresAt ? new Date(doc.auth.expiresAt).getTime() : null
    const endingSoon = expiresAt !== null && expiresAt - Date.now() < 10 * 60 * 1000
    const canRefresh = doc.auth.refreshTokenEnc && ['ebay', 'tiktok_shop'].includes(doc.marketplace)
    if (canRefresh && (force || endingSoon)) {
      try {
        const next = await this.refreshToken(doc.marketplace, doc.auth.refreshTokenEnc)
        doc.auth.accessTokenEnc = next.access_token
        if (next.refresh_token) doc.auth.refreshTokenEnc = next.refresh_token
        doc.auth.expiresAt = this.tokenExpiry(next.expires_in)
        await doc.save()
      } catch (err) {
        require('../notify').tokenFailed(doc, err.message).catch(() => {})
        if (err.deadLogin) {
          // The login can't be refreshed any more: show the shop as needing a reconnect and stop syncing it.
          await Shop.updateOne({ _id: doc._id }, { status: 'error', authError: err.message }).catch(() => {})
          throw Object.assign(new Error(`${doc.name} needs reconnecting: ${err.message}`), { notConnected: true })
        }
        if (force) throw err
        console.warn(`[tokens] ${doc.name}: refresh failed: ${err.message}`)
      }
    }
    return doc.auth.accessTokenEnc
  }

  /** Runs `fn(token)`; on an expired-login error, refreshes once and tries again. */
  async withShopToken(shop, fn) {
    const token = await this.freshToken(shop)
    if (!token) throw Object.assign(new Error(`${shop.name} is not connected.`), { notConnected: true })
    try {
      return await fn(token)
    } catch (err) {
      if (!(err.status === 401 || /expired|invalid access.?token/i.test(err.message || ''))) throw err
      return fn(await this.freshToken(shop, { force: true }))
    }
  }

  messageAccessError(shop, err) {
    if (err.notConnected) return err.message
    const denied = err.status === 401 || /scope|access token|access denied|invalid access/i.test(err.message || '')
    return denied
      ? `${shop.name} is connected, but this login does not include message access. Connect the shop again from Settings.`
      : err.message
  }

  /** Imports conversations; `newInbound` lists buyer messages seen for the first time. */
  async syncInboxForShop(shop) {
    const summary = { shopName: shop.name, marketplace: shop.marketplace, imported: 0, newInbound: [] }
    const service = this.getService(shop.marketplace)
    if (typeof service.getInbox !== 'function') {
      return { ...summary, error: `${shop.name} inbox sync is not available.` }
    }
    let result
    try {
      result = await this.withShopToken(shop, (token) => service.getInbox(token, shop))
    } catch (err) {
      return { ...summary, error: this.messageAccessError(shop, err) }
    }
    const threads = Array.isArray(result) ? result : result.threads || []
    if (result.accountUsername && result.accountUsername !== shop.accountUsername) {
      await Shop.updateOne({ _id: shop._id }, { accountUsername: result.accountUsername })
      shop.accountUsername = result.accountUsername
    }

    for (const thread of threads) {
      if (!thread.externalThreadId) continue
      const convo = await Conversation.findOneAndUpdate(
        { shopId: shop._id, externalThreadId: thread.externalThreadId },
        {
          $set: {
            marketplace: shop.marketplace,
            status: thread.status || 'open',
            lastMessageAt: thread.lastMessageAt || new Date(),
            lastMessagePreview: thread.lastMessagePreview || '',
            unreadCount: thread.unreadCount || 0,
            ...(thread.customerName ? { customerName: thread.customerName } : {}),
            ...(thread.replyable !== undefined ? { replyable: thread.replyable } : {}),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      for (const message of thread.messages || []) {
        if (!message.externalMessageId) continue
        const saved = await Message.updateOne(
          { shopId: shop._id, externalMessageId: message.externalMessageId },
          {
            $setOnInsert: {
              conversationId: convo._id,
              shopId: shop._id,
              direction: message.direction || 'inbound',
              senderType: message.senderType || 'customer',
              text: message.text || '',
              externalMessageId: message.externalMessageId,
              sentAt: message.sentAt || new Date(),
              deliveryStatus: 'delivered',
            },
          },
          { upsert: true },
        )
        if (saved.upsertedCount && message.direction === 'inbound') {
          summary.newInbound.push({ conversationId: convo._id, messageId: saved.upsertedId })
        }
      }
      summary.imported += 1
    }
    return summary
  }

  /** Recent messages of a conversation straight from the marketplace, oldest first. */
  async getThreadHistory(shop, convo) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getThreadMessages !== 'function') return []
    const conversationType = convo.replyable === false ? 'FROM_EBAY' : 'FROM_MEMBERS'
    return this.withShopToken(shop, (token) => service.getThreadMessages(token, shop, convo.externalThreadId, { conversationType }))
  }

  /** Sends text to the buyer on the marketplace; returns `{ externalMessageId }`. */
  async sendReply(shop, convo, text) {
    const service = this.getService(shop.marketplace)
    if (typeof service.sendMessage !== 'function') {
      throw new Error(`Replying from the dashboard is not available for ${shop.name}.`)
    }
    if (convo.replyable === false) {
      throw new Error('This conversation is a marketplace notice and cannot be answered.')
    }
    try {
      return await this.withShopToken(shop, (token) => service.sendMessage(token, shop, convo.externalThreadId, text))
    } catch (err) {
      throw new Error(this.messageAccessError(shop, err))
    }
  }

  /**
   * Full synchronization across all connected marketplace shops
   */
  async syncAllShops() {
    const shops = await Shop.find({ status: 'connected' }).select('+auth.accessTokenEnc')
    const results = []
    for (const shop of shops) {
      const res = await this.syncAllForShop(shop)
      results.push(res)
    }
    return results
  }
}

module.exports = new UnifiedMarketplaceManager()
