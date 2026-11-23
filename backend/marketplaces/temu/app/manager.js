
const profiles = require('../../../services/marketplace/profiles')
const config = require('../../../config/marketplaces')
const Order = require('../../../models/Order')
const Customer = require('../../../models/Customer')
const SyncLog = require('../../../models/SyncLog')
const Shop = require('../../../models/Shop')
const Product = require('../../../models/Product')
const Listing = require('../../../models/Listing')
const InventoryLog = require('../../../models/InventoryLog')
const IgnoredListing = require('../../../models/IgnoredListing')
const { saveCustomerStats } = require('./services/customerStats')
const { newSku, isMachineSku, skuPrefix } = require('../../../utils/sku')
const { productKey, listingAliases, ignoreTokens } = require('../../../services/marketplace/listingKeys')
const ADAPTER = require('..')
const SERVICE = ADAPTER.service

/** Connecting to the shop (OAuth, tokens, access checks) stays shared: services/marketplace. */
const connection = () => require('../../../services/marketplace')

/** Temu's sync and listing logic: orders, listings, stock, publishing (no inbox). */
class Manager {
  freshToken(shop, options) {
    return connection().freshToken(shop, options)
  }

  withShopToken(shop, fn) {
    return connection().withShopToken(shop, fn)
  }

  messageAccessError(shop, err) {
    return connection().messageAccessError(shop, err)
  }

  checkShopAccess(shop) {
    return connection().checkShopAccess(shop)
  }

  /**
   * Publishes a product listing to the respective marketplace API
   */
  async publishListing(shop, product, options = {}) {
    const service = SERVICE
    const rawImages = options.images?.length ? options.images : (product.images || [])
    const images = this.publicImageUrls(rawImages)
    const nextOptions = { ...options, images, shop }
    try {
      return await this.withShopToken(shop, (token) => service.createListing(token, product, nextOptions))
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
  async pushStock(shop, { sku, quantity, externalListingId, variants, variantSku, variantStock, syncAllVariants }) {
    const service = SERVICE
    return this.withShopToken(shop, (token) => service.updateStock(token, sku, quantity, {
      shop,
      externalListingId,
      variants,
      variantSku,
      variantStock,
      syncAllVariants,
    }))
  }

  /**
   * Pushes shipping fulfillment & tracking number to eBay
   */
  async pushShipping(order, { carrier, trackingNumber }) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { pushed: false, note: 'Shop not connected or credentials not present' }
    }

    const service = SERVICE
    if (typeof service.createShippingFulfillment !== 'function') {
      return { pushed: false, note: `${shop.marketplace} shipping push is not available` }
    }

    await this.withShopToken(shop, async (token) => {
      let lineItems = (order.items || [])
        .filter((item) => item.lineItemId)
        .map((item) => ({ lineItemId: item.lineItemId, quantity: item.quantity, externalListingId: item.externalListingId }))
      return service.createShippingFulfillment(token, order.externalOrderId, { carrier, trackingNumber, lineItems, shop })
    })
    return { pushed: true }
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
    try {
      const service = SERVICE
      let updatedCount = 0
      const res = await service.getOrders(token, { limit: 200, shop })
      rawOrders = res.orders || []

      let createdCount = 0
      let failedCount = 0
      const touchedCustomerIds = []

      for (const ord of rawOrders) {
        try {
        let customer = null
        const rawBuyer = ord.buyer?.username || ord.buyer?.name
        const buyerUsername = rawBuyer && !['eBay Customer', 'TikTok Shop customer', 'Temu customer'].includes(rawBuyer) ? rawBuyer : ''
        if (buyerUsername) {
          customer = await Customer.findOne({
            $or: [
              { 'identities.externalBuyerId': buyerUsername },
              { 'identities.username': buyerUsername },
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
            let existingListing = await Listing.findOne({ shopId: shop._id, externalListingId: item.externalListingId })
            if (existingListing?.productId) {
              prod = await Product.findById(existingListing.productId)
            }
          }

          // 2. If still not found, check product collection by normalized SKU, variants, and aliases
          if (!prod) {
            const candidates = [
              item.sku,
              item.rawSku,
              item.externalListingId,
              item.externalListingId ? `EBAY-${item.externalListingId}` : null,
              item.externalListingId ? `TTS-${item.externalListingId}` : null,
            ].filter(Boolean)
            prod = await Product.findOne({ $or: [{ sku: { $in: candidates } }, { 'variants.sku': { $in: candidates } }] })
          }

          let itemImages = []
          if (!prod || !prod.images || prod.images.length === 0) {
            if (!itemImages.length && item.image) {
              itemImages.push(item.image)
            }
          }

          if (!prod) {
            const prefix = skuPrefix(shop.marketplace)
            prod = await Product.create({
              sku: item.sku || (item.externalListingId ? `${prefix}-${item.externalListingId}` : newSku(shop.marketplace)),
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

          // Links the product to its listing; check (productId, shopId) first to avoid E11000 on relists
          if (item.externalListingId) {
            const existingForProd = await Listing.findOne({ productId: prod._id, shopId: shop._id })
            if (!existingForProd) {
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
                  },
                },
                { upsert: true },
              )
            } else if (!existingForProd.externalListingId) {
              existingForProd.externalListingId = item.externalListingId
              await existingForProd.save()
            }
          }
        }

        const existing = await Order.findOne({ shopId: shop._id, externalOrderId: ord.externalOrderId })
        if (existing) {
          // Never resurrect cancelled/refunded orders (except cancelled -> refunded), never regress
          // delivered back to shipped, and never regress shipped/delivered back to paid/pending/processing.
          const keepTerminal =
            (existing.status === 'refunded') ||
            (existing.status === 'cancelled' && ord.status !== 'refunded')
          const keepDelivered = existing.status === 'delivered' && ord.status === 'shipped'
          const keepForward = ['shipped', 'delivered'].includes(existing.status) && ['paid', 'pending', 'processing'].includes(ord.status)
          if (keepTerminal || keepDelivered || keepForward) {
            // Keep the terminal or further-progressed status we already have.
          } else {
            existing.status = ord.status
          }
          if (!existing.customerId && customer?._id) existing.customerId = customer._id
          if (ord.buyer?.name && (!existing.buyer?.name || ['eBay Customer', 'TikTok Shop customer', 'Temu customer'].includes(existing.buyer.name))) {
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
              if (!item.externalListingId && ord.items[i]?.externalListingId) item.externalListingId = ord.items[i].externalListingId
            })
          }
          // Totals the marketplace filled in later (Temu reports amounts separately).
          if (!Number(existing.totals?.total) && Number(ord.totals?.total)) {
            existing.totals = { ...(existing.totals?.toObject?.() || existing.totals), ...ord.totals }
            if ((ord.items || []).length === existing.items.length) {
              existing.items.forEach((item, i) => {
                if (!item.unitPrice && ord.items[i]?.unitPrice) item.unitPrice = ord.items[i].unitPrice
              })
            }
          }
          if (ord.shippingAddress) {
            const prevAddr = existing.shippingAddress?.toObject?.() || existing.shippingAddress || {}
            if (!prevAddr.street || (!prevAddr.city && ord.shippingAddress.city) || (!prevAddr.state && ord.shippingAddress.state)) {
              existing.shippingAddress = {
                ...prevAddr,
                ...Object.fromEntries(Object.entries(ord.shippingAddress).filter(([, v]) => v)),
              }
            }
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
            customerId: customer?._id,
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
                if (Number.isFinite(own?.stock) && own?.lastSyncedAt && ord.placedAt && new Date(own.lastSyncedAt) > new Date(ord.placedAt)) continue
                const prod = await Product.findById(item.productId)
                if (prod && prod.stock > 0) {
                  const stockBefore = prod.stock
                  const stockAfter = Math.max(0, prod.stock - item.quantity)
                  const variants = Array.isArray(prod.variants) ? prod.variants.map((v) => (v.toObject ? v.toObject() : { ...v })) : []
                  const variantIdx = variants.findIndex((v) => (
                    (item.skuId && String(v.externalSkuId || '') === String(item.skuId))
                    || (item.sku && v.sku === item.sku)
                    || (item.rawSku && v.sku === item.rawSku)
                  ))
                  if (variantIdx !== -1) {
                    variants[variantIdx].stock = Math.max(0, Number(variants[variantIdx].stock || 0) - item.quantity)
                  }
                  await Product.findByIdAndUpdate(item.productId, {
                    $set: { stock: stockAfter, ...(variantIdx !== -1 ? { variants } : {}) },
                  })
                  // This shop's own stock fell by the sold quantity; its next listing sync then sees
                  // no change. The other shops are brought down by propagateStock below.
                  if (own) {
                    const baseStock = Number.isFinite(own.stock) ? own.stock : stockBefore
                    const shopStock = Math.max(0, baseStock - item.quantity)
                    await Listing.updateOne(
                      { shopId: shop._id, productId: item.productId },
                      { $set: { stock: shopStock, ...(shopStock === 0 ? { status: 'out_of_stock' } : {}) } },
                    )
                  }
                  soldProductIds.add(String(item.productId))
                  await InventoryLog.create({
                    productId: item.productId,
                    ...(variantIdx !== -1 ? { variantSku: variants[variantIdx].sku } : {}),
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
            if (sold) await require('../../../services/catalog/fanOut').propagateStock(sold, { exceptShopId: shop._id })
          }
        }
        } catch (ordErr) {
          failedCount++
          console.warn(`[syncOrders] ${shop.name} order ${ord.externalOrderId || '?'} failed:`, ordErr.message)
        }
      }

      await saveCustomerStats(touchedCustomerIds)

      await Shop.updateOne({ _id: shop._id }, {
        lastSyncAt: new Date(),
      })

      syncLog.status = failedCount > 0 ? 'partial' : 'success'
      syncLog.stats = {
        fetched: rawOrders.length,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
      }
      syncLog.finishedAt = new Date()
      await syncLog.save()

      return {
        synced: rawOrders.length,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
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
  async pushPrice(shop, { sku, price, externalListingId, variants }) {
    const service = SERVICE
    return this.withShopToken(shop, (token) => service.updatePrice(token, sku, price, 'USD', { shop, externalListingId, variants }))
  }

  /**
   * Looks up categories via marketplace taxonomy / recommendation API
   */
  async getCategories(shop, query = 'General', opts = {}) {
    const service = SERVICE
    if (typeof service.getCategories !== 'function') return []
    return this.withShopToken(shop, (token) => service.getCategories(token, query, { shop, ...opts }))
  }

  /** What each marketplace's listing API supports, so the List dialog can show the right fields. */
  listingCapabilities() {
    const service = SERVICE
    return service?.listingCapabilities || { canList: false, editAfterListing: [] }
  }

  /**
   * Pause, publish, end, relist or delete a listing using that shop's API.
   * Returns the fields to save on the listing document.
   */
  async applyListingAction(shop, listing, action, options = {}) {
    const allowed = (profiles.PROFILES[shop.marketplace]?.listingActions || []).some((item) => {
      if (item.id !== action) return false
      if (listing.marketplaceStatus && Array.isArray(item.raw)) return item.raw.includes(listing.marketplaceStatus)
      return item.statuses.includes(listing.status)
    })
    if (!allowed) throw new Error(`This ${'shop'} listing cannot ${action} in its current state.`)
    const service = SERVICE
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
    const service = SERVICE
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
    for (const keyToken of ignoreTokens(id, aliasList, extras)) {
      await IgnoredListing.updateOne(
        { shopId, productKey: keyToken },
        { $setOnInsert: { shopId, productKey: keyToken } },
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
    const service = SERVICE
    if (typeof service.getItemAspects !== 'function') return []
    return this.withShopToken(shop, (token) => service.getItemAspects(token, categoryId, { shop }))
  }

  /** Extra category requirements, such as TikTok certifications & size chart rules. */
  async getCategoryRules(shop, categoryId) {
    const service = SERVICE
    if (typeof service.getCategoryRules !== 'function') return []
    return this.withShopToken(shop, (token) => service.getCategoryRules(token, categoryId, { shop }))
  }

  /** Available brands for a shop/category (e.g., TikTok Shop brand picker). */
  async getBrands(shop, opts = {}) {
    const service = SERVICE
    if (typeof service.getBrands !== 'function') return []
    return this.withShopToken(shop, (token) => service.getBrands(token, { shop, ...opts }))
  }

  /** Saved size chart templates (e.g., TikTok Shop size charts). */
  async getSizeCharts(shop, opts = {}) {
    const service = SERVICE
    if (typeof service.getSizeCharts !== 'function') return []
    return this.withShopToken(shop, (token) => service.getSizeCharts(token, { shop, ...opts }))
  }

  /**
   * Processes refunds/returns across marketplaces
   */
  async processRefund(order, { reason, comment, amount }) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { success: false, note: 'Shop not connected or credentials missing' }
    }
    const service = SERVICE
    if (typeof service.issueRefund !== 'function') {
      return { success: false, note: `${shop.marketplace} refunds are not available from this connector` }
    }
    return this.withShopToken(shop, (token) => service.issueRefund(token, order.externalOrderId, {
      reason,
      comment,
      amount,
      orderTotal: order.totals?.total,
      shop,
    }))
  }

  /**
   * Cancels unfulfilled order across marketplaces
   */
  async cancelOrder(order, { reason = 'OUT_OF_STOCK', comment = '' } = {}) {
    const shop = await Shop.findById(order.shopId)
    if (!shop || shop.status !== 'connected') {
      return { success: false, note: 'Shop not connected or credentials missing' }
    }
    const service = SERVICE
    if (typeof service.cancelOrder !== 'function') {
      return { success: false, note: `${shop.marketplace} order cancellation is not supported via API` }
    }
    return this.withShopToken(shop, (token) => service.cancelOrder(token, order.externalOrderId, { reason, comment, shop }))
  }

  /** Recent transactions and fees from the marketplace's finance API. */
  async getFinances(shop) {
    const service = SERVICE
    if (typeof service.getFinances !== 'function') return { transactions: [], total: 0 }
    return this.withShopToken(shop, (token) => service.getFinances(token, { shop }))
  }

  /** Listings as they are on the marketplace right now, in one shape for every shop. */
  async fetchShopListings(shop, token) {
    const service = SERVICE
    if (typeof service.getInventory !== 'function') return { complete: false, items: [] }
    const limit = 200
    const res = await service.getInventory(token, { limit, shop })
    const items = res.inventoryItems || []
    return {
      complete: res.complete ?? items.length < limit,
      items: items.map((item) => ({
        ...item,
        aliases: listingAliases(item.externalListingId),
        matchSkus: [...new Set([...(item.matchSkus || []), item.sku, item.rawSku].filter((sku) => sku && !/^none$/i.test(sku)))],
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
      const seenProductKeys = new Set()
      for (const id of seenListingIds) {
        listingAliases(id).forEach((key) => seen.add(key))
        const pKey = productKey(id)
        if (pKey) seenProductKeys.add(pKey)
      }
      const cutoff = new Date(Date.now() - 10 * 60 * 1000)
      const candidates = await Listing.find({
        shopId: shop._id,
        status: { $in: SERVICE.endableStatuses || ['live', 'out_of_stock', 'pending', 'paused'] },
        externalListingId: { $exists: true, $nin: ['', null] },
        updatedAt: { $lt: cutoff },
      })
      for (const listing of candidates) {
        const ext = String(listing.externalListingId || '')
        const isMatched = ext.includes(':')
            ? seen.has(ext)
            : (listingAliases(ext).some((key) => seen.has(key)) || seenProductKeys.has(ext))
        if (isMatched) continue
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
        await require('../../../services/catalog/fanOut').propagateStock(product, { onlyListingId: listing._id })
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
    await require('../../../services/catalog/fanOut').propagateStock(product, { exceptShopId: shop._id })
  }

  /** One listing's revise call for a dashboard edit; null when the shop can't revise listings. */
  async reviseOne(shop, listing, product, changes) {
    const service = SERVICE
    if (typeof service.reviseListing !== 'function') return null
    const payload = {
      ...changes,
      ...(changes.variants ? { variants: changes.variants } : product.variants?.length ? { variants: product.variants } : {}),
      ...(changes.images ? { images: this.publicImageUrls(changes.images) } : {}),
    }
    return this.withShopToken(shop, (token) => service.reviseListing(token, listing.externalListingId, payload, { shop, listing, product }))
  }

  /** One listing's stock push (the shared product stock). */
  async pushStockOne(shop, listing, product, quantity) {
    return this.pushStock(shop, {
      sku: product.sku,
      quantity,
      externalListingId: listing.externalListingId,
      productId: product._id,
      variants: product.variants,
      syncAllVariants: Boolean(product.variants?.length),
    })
  }

  /** Saves one marketplace listing, creating or updating its product. */
  async saveSyncedListing(shop, item) {
    const ids = [...new Set([...(item.aliases || []), ...listingAliases(item.externalListingId)])]
    let listing = null
    let consolidated = false
    listing = await Listing.findOne({
        shopId: shop._id,
        externalListingId: { $in: ids },
      })
    let product = listing ? await Product.findById(listing.productId) : null
    if (!product && item.matchSkus?.length) {
      product = await Product.findOne({ $or: [{ sku: { $in: item.matchSkus } }, { 'variants.sku': { $in: item.matchSkus } }] })
    }
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
      subtitle: item.subtitle,
      description: item.description,
      basePrice: item.price > 0 ? item.price : undefined,
      listPrice: item.listPrice > 0 ? item.listPrice : undefined,
      stock: Number.isFinite(item.stock) ? item.stock : undefined,
      images: item.images?.length ? item.images : undefined,
      category: item.category,
      brand: item.brand,
      brandId: item.brandId,
      mpn: item.mpn,
      conditionDescription: item.conditionDescription,
      dispatchTimeMax: item.dispatchTimeMax,
    }
    const created = !product
    if (created) {
      product = await Product.create({
        sku: item.sku,
        ...Object.fromEntries(Object.entries(fromMarketplace).filter(([, value]) => value !== undefined && value !== '')),
        title: item.title || `Item ${item.externalListingId}`,
        weight: item.weight || 1,
        dimensions: item.dimensions || undefined,
        ...(item.identifierCode?.code ? { identifierCode: item.identifierCode } : {}),
        ...(item.bestOffer?.enabled ? { bestOffer: item.bestOffer } : {}),
        ...(item.sizeChart && (item.sizeChart.templateId || item.sizeChart.image) ? { sizeChart: item.sizeChart } : {}),
        attributes: item.attributes || undefined,
        ...(Array.isArray(item.variants) ? { variants: item.variants } : {}),
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
      if (item.identifierCode?.code) product.identifierCode = item.identifierCode
      if (item.bestOffer?.enabled) product.bestOffer = item.bestOffer
      if (item.sizeChart && (item.sizeChart.templateId || item.sizeChart.image)) product.sizeChart = item.sizeChart
      if (Array.isArray(item.variants) && ((item.variants.length > 0))) {
        product.variants = item.variants
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
      syncError: item.listingError,
      lastSyncedAt: new Date(),
      ...(item.detailed ? { detailSyncedAt: new Date() } : {}),
    })
    await listing.save()
    const upgradedFromSingle = false
    const prevStock = (consolidated || upgradedFromSingle) ? undefined : wasStock
    if (!created && Number.isFinite(item.stock)) await this.reconcileStock(product, listing, shop, prevStock, item.stock)
    const notify = require('../../../services/core/notify')
    await notify.listingStatusChanged(listing, shop, { wasStatus, wasRaw, imported: created }).catch(() => {})
    if (Number.isFinite(item.stock)) {
      await notify.stockChanged(product, shop, { was: wasStock, stock: item.stock }).catch(() => {})
    }
    return { created }
  }

  /**
   * Full synchronization for this shop (orders and listings; Temu has no inbox)
   */
  async syncAllForShop(shop) {
    const listingsResult = await this.syncListingsForShop(shop).catch((err) => ({ error: err.message }))
    const ordersResult = await this.syncOrdersForShop(shop).catch((err) => ({ error: err.message }))
    return {
      shopId: shop._id,
      shopName: shop.name,
      marketplace: shop.marketplace,
      orders: ordersResult,
      listings: listingsResult,
    }
  }

}

module.exports = new Manager()
