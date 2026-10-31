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
const Conversation = require('../../models/Conversation')
const Message = require('../../models/Message')
const { saveCustomerStats } = require('../customerStats')

const marketplaceServices = {
  ebay,
  tiktok_shop: tiktokShop,
  temu,
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
    const shop = await Shop.findById(order.shopId).select('+auth.accessTokenEnc')
    if (!shop || !shop.auth?.accessTokenEnc) {
      return { pushed: false, note: 'Shop not connected or credentials not present' }
    }

    const token = shop.auth.accessTokenEnc
    const service = this.getService(shop.marketplace)
    if (typeof service.createShippingFulfillment !== 'function') {
      return { pushed: false, note: `${shop.marketplace} shipping push is not available` }
    }

    await service.createShippingFulfillment(token, order.externalOrderId, {
      carrier,
      trackingNumber,
      lineItems: (order.items || []).map((i) => ({ lineItemId: i.sku, quantity: i.quantity })),
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
      const service = this.getService(shop.marketplace)
      let updatedCount = 0
      if (shop.marketplace === 'ebay') {
        const res = await service.getOrders(token, { limit: 50 })
        rawOrders = (res.orders || []).map((o) => ({
          externalOrderId: o.orderId,
          placedAt: new Date(o.creationDate),
          status: o.orderFulfillmentStatus === 'FULFILLED' ? 'shipped' : 'paid',
          buyer: {
            name: o.buyer?.username || 'eBay Customer',
            email: o.buyer?.buyerRegistrationAddress?.email || '',
          },
          totals: {
            total: parseFloat(o.pricingSummary?.total?.value || 0),
            currency: o.pricingSummary?.total?.currency || 'USD',
          },
          items: (o.lineItems || []).map((li) => ({
            sku: li.sku || li.legacyItemId,
            externalListingId: li.legacyItemId ? String(li.legacyItemId) : undefined,
            title: li.title,
            quantity: li.quantity,
            unitPrice: parseFloat(li.lineItemCost?.value || 0),
          })),
        }))
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
        if (ord.buyer?.name) {
          customer = await Customer.findOne({ 'identities.externalBuyerId': ord.buyer.name })
          if (!customer) {
            customer = await Customer.create({
              name: ord.buyer.name,
              email: ord.buyer.email || undefined,
              identities: [
                {
                  shopId: shop._id,
                  marketplace: shop.marketplace,
                  externalBuyerId: ord.buyer.name,
                  username: ord.buyer.name,
                },
              ],
            })
          } else {
            const hasId = (customer.identities || []).some(
              (i) => i.shopId?.toString() === shop._id.toString() && i.externalBuyerId === ord.buyer.name,
            )
            if (!hasId) {
              customer.identities = customer.identities || []
              customer.identities.push({
                shopId: shop._id,
                marketplace: shop.marketplace,
                externalBuyerId: ord.buyer.name,
                username: ord.buyer.name,
              })
              await customer.save()
            }
          }
          if (customer?._id) touchedCustomerIds.push(customer._id)
        }

        // Ensure catalog products and listings exist for ordered items
        for (const item of ord.items || []) {
          if (!item.sku) continue
          let prod = await Product.findOne({ sku: item.sku })

          let itemImages = []
          if (!prod || !prod.images || prod.images.length === 0) {
            const tokenToUse = appToken || token
            if (shop.marketplace === 'ebay' && tokenToUse && typeof service.getItemDetails === 'function') {
              try {
                const details = await service.getItemDetails(tokenToUse, item.sku)
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
            }
          }

          if (!prod) {
            prod = await Product.create({
              sku: item.sku,
              title: item.title || `Item ${item.sku}`,
              category: 'General',
              brand: shop.name || 'eBay Store',
              images: itemImages,
              basePrice: item.unitPrice || 19.99,
              stock: 10,
              status: 'active',
              source: 'marketplace_sync',
            })
          } else if (itemImages.length > 0 && (!prod.images || prod.images.length === 0)) {
            prod.images = itemImages
            await prod.save()
          }
          item.productId = prod._id

          // Links the product to its listing; the listing sync decides whether it is still live.
          if (item.externalListingId) {
            await Listing.updateOne(
              { productId: prod._id, shopId: shop._id },
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
          existing.status = ord.status
          if (!existing.customerId && customer?._id) existing.customerId = customer._id
          await existing.save()
          updatedCount++
        } else {
          await Order.create({
            ...ord,
            shopId: shop._id,
            marketplace: shop.marketplace,
            customerId: customer?._id || null,
          })
          createdCount++
        }
      }

      await saveCustomerStats(touchedCustomerIds)

      await Shop.updateOne({ _id: shop._id }, { lastSyncAt: new Date() })

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
  async applyListingAction(shop, listing, action) {
    const allowed = (profiles.PROFILES[shop.marketplace]?.listingActions || []).some((item) => {
      if (item.id !== action) return false
      if (listing.marketplaceStatus && item.raw?.includes(listing.marketplaceStatus)) return true
      return item.statuses.includes(listing.status)
    })
    if (!allowed) throw new Error(`This ${shop.marketplace === 'ebay' ? 'eBay' : 'shop'} listing cannot ${action} in its current state.`)
    const service = this.getService(shop.marketplace)
    if (typeof service.applyListingAction !== 'function') throw new Error(`Listing actions are not available for ${shop.name}.`)
    return this.withShopToken(shop, (token) => service.applyListingAction(token, action, listing, { shop }))
  }

  /**
   * Looks up category attribute schema via eBay Taxonomy API
   */
  async getCategoryAttributes(shop, categoryId) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getItemAspects !== 'function') return []
    return this.withShopToken(shop, (token) => service.getItemAspects(token, categoryId, { shop }))
  }

  /**
   * Processes refunds/returns across marketplaces
   */
  async processRefund(order, { reason, comment, amount }) {
    const shop = await Shop.findById(order.shopId).select('+auth.accessTokenEnc')
    if (!shop || !shop.auth?.accessTokenEnc) {
      return { success: false, note: 'Shop not connected or credentials missing' }
    }
    const token = shop.auth.accessTokenEnc
    const service = this.getService(shop.marketplace)
    if (typeof service.issueRefund !== 'function') {
      return { success: false, note: `${shop.marketplace} refunds are not available from this connector` }
    }
    return service.issueRefund(token, order.externalOrderId, { reason, comment, amount })
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

  /** Listings as they are on the marketplace right now, in one shape for every shop. */
  async fetchShopListings(shop, token) {
    const service = this.getService(shop.marketplace)
    if (shop.marketplace === 'ebay') {
      const items = await service.getListings(token)
      return {
        complete: items.length < 200,
        items: items.map((item) => ({
          sku: item.sku || `EBAY-${item.itemId}`,
          aliases: [item.itemId, `item-${item.itemId}`, ...(item.sku ? [`item-${item.sku}`, `ebay-item-${item.sku}`] : [])],
          matchSkus: [item.sku, item.itemId, `EBAY-${item.itemId}`].filter(Boolean),
          externalListingId: item.itemId,
          title: item.title,
          description: item.description,
          price: item.price,
          stock: item.stock,
          images: item.images,
          category: item.category,
          brand: item.brand,
          attributes: item.specifics,
          listingStatus: 'live',
          marketplaceStatus: item.listingStatus || 'Active',
          listingUrl: item.url || `https://www.ebay.com/itm/${item.itemId}`,
        })),
      }
    }
    if (typeof service.getInventory !== 'function') return { complete: false, items: [] }
    const res = await service.getInventory(token, { limit: 200, shop })
    const items = res.inventoryItems || []
    return {
      complete: res.complete ?? items.length < 200,
      items: items.map((item) => ({
        ...item,
        aliases: [item.externalListingId],
        matchSkus: [item.sku].filter(Boolean),
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
    if (fetched.complete) {
      const result = await Listing.updateMany(
        {
          shopId: shop._id,
          status: { $in: ['live', 'out_of_stock', 'pending', 'paused'] },
          externalListingId: { $exists: true, $nin: seenListingIds },
          updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        { status: 'ended', syncError: `No longer listed on ${config[shop.marketplace]?.name || shop.marketplace}.`, lastSyncedAt: new Date() },
      )
      ended = result.modifiedCount || 0
    }
    if (failures.length) console.warn(`Listing sync for ${shop.name}: ${failures.length} item(s) failed. ${failures.slice(0, 3).join(' | ')}`)
    await Shop.updateOne({ _id: shop._id }, { lastSyncAt: new Date() })
    return { productsImported: createdProducts, listingsLinked: updatedListings, listingsEnded: ended, failed: failures.length }
  }

  /** Saves one marketplace listing, creating or updating its product. */
  async saveSyncedListing(shop, item) {
    let listing = await Listing.findOne({ shopId: shop._id, externalListingId: { $in: item.aliases } })
    let product = listing ? await Product.findById(listing.productId) : null
    if (!product && item.matchSkus.length) product = await Product.findOne({ sku: { $in: item.matchSkus } })

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
        if (value !== undefined && value !== '') product[field] = value
      }
      if (item.weight != null && (product.weight == null || product.weight === 1)) product.weight = item.weight
      if (item.listingStatus === 'live' && product.status === 'draft') product.status = 'active'
      await product.save()
    }

    if (!listing) listing = await Listing.findOne({ productId: product._id, shopId: shop._id })
    if (!listing) listing = new Listing({ productId: product._id, shopId: shop._id })
    Object.assign(listing, {
      marketplace: shop.marketplace,
      externalListingId: item.externalListingId,
      price: item.price,
      status: item.listingStatus === 'live' && item.stock === 0 ? 'out_of_stock' : item.listingStatus,
      marketplaceStatus: item.marketplaceStatus || undefined,
      listingUrl: item.listingUrl || undefined,
      syncError: item.listingError || null,
      lastSyncedAt: new Date(),
    })
    await listing.save()
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
