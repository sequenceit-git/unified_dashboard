/**
 * Unified Marketplace Manager
 * Single interface for eBay, TikTok Shop, and Temu operations
 */

const ebay = require('./ebay')
const tiktokShop = require('./tiktok')
const temu = require('./temu')
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
    const token = shop.auth?.accessTokenEnc || ''

    if (!token) {
      throw new Error(`Shop "${shop.name}" does not have an active ${shop.marketplace} token. Please connect your store via OAuth first.`)
    }

    return service.createListing(token, product, { ...options, shop })
  }


  /**
   * Pushes stock updates to a connected marketplace
   */
  async pushStock(shop, { sku, quantity, externalListingId }) {
    const service = this.getService(shop.marketplace)
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) return { success: false, reason: 'unauthorized_shop' }
    return service.updateStock(token, sku, quantity, { shop, externalListingId })
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

    if (shop._id && !shop.auth?.accessTokenEnc) {
      shop = await Shop.findById(shop._id).select('+auth.accessTokenEnc +auth.refreshTokenEnc')
    }
    const token = shop.auth?.accessTokenEnc || ''
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

          // Ensure listing link exists
          await Listing.findOneAndUpdate(
            { productId: prod._id, shopId: shop._id },
            {
              productId: prod._id,
              shopId: shop._id,
              marketplace: shop.marketplace,
              externalListingId: `item-${item.sku}`,
              price: item.unitPrice || prod.basePrice,
              status: 'live',
              lastSyncedAt: new Date(),
            },
            { upsert: true, returnDocument: 'after' },
          )
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

      shop.lastSyncAt = new Date()
      await shop.save()

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
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) return { success: false, reason: 'unauthorized_shop' }
    const service = this.getService(shop.marketplace)
    return service.updatePrice(token, sku, price, 'USD', { shop, externalListingId })
  }

  /**
   * Looks up categories via eBay Taxonomy API
   */
  async getCategories(shop, query = 'General') {
    const service = this.getService(shop.marketplace)
    if (typeof service.getCategories !== 'function') return []
    const token = shop.auth?.accessTokenEnc || ''
    return service.getCategories(token, query)
  }

  /**
   * Looks up category attribute schema via eBay Taxonomy API
   */
  async getCategoryAttributes(shop, categoryId) {
    const service = this.getService(shop.marketplace)
    if (typeof service.getItemAspects !== 'function') return []
    const token = shop.auth?.accessTokenEnc || ''
    return service.getItemAspects(token, categoryId)
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

  /**
   * Synchronizes existing product listings from eBay into the platform
   * Automatically populates the Products catalog and Listings tab!
   */
  async syncListingsForShop(shop) {
    if (shop._id && !shop.auth?.accessTokenEnc) {
      shop = await Shop.findById(shop._id).select('+auth.accessTokenEnc +auth.refreshTokenEnc')
    }
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) {
      return { synced: 0, reason: 'No active access token' }
    }

    const service = this.getService(shop.marketplace)
    let rawItems = []

    try {
      const res = await service.getInventory(token, { limit: 50, shop })
      rawItems = (res.inventoryItems || []).map((item) => (
        item.title
          ? {
              sku: item.sku,
              title: item.title,
              description: item.description || '',
              price: Number(item.price || 0),
              stock: Number(item.stock || 0),
              images: item.images || [],
              weight: item.weight,
              dimensions: item.dimensions,
              attributes: item.attributes,
              category: item.category || 'General',
              brand: item.brand || '',
              externalListingId: item.externalListingId,
            }
          : {
              sku: item.sku,
              title: item.product?.title || `eBay Item ${item.sku}`,
              description: item.product?.description || '',
              price: Number(item.product?.aspects?.Price?.[0] || 19.99),
              stock: Number(item.availability?.shipToLocationAvailability?.quantity || 10),
              images: item.product?.imageUrls || [],
              weight: Number(item.packageWeightAndSize?.weight?.value || 1),
              category: item.product?.aspects?.Category?.[0] || 'General',
              brand: item.product?.aspects?.Brand?.[0] || 'Generic',
              externalListingId: `ebay-item-${item.sku}`,
            }
      ))

      let createdProducts = 0
      let updatedListings = 0

      for (const item of rawItems) {
        // 1. Create or find Catalog Product
        let product = await Product.findOne({ sku: item.sku })
        if (!product) {
          product = await Product.create({
            sku: item.sku,
            title: item.title,
            description: item.description,
            category: item.category || 'General',
            brand: item.brand || 'DevBrand',
            images: item.images || [],
            basePrice: item.price || 19.99,
            stock: item.stock || 0,
            weight: item.weight || 1,
            dimensions: item.dimensions || undefined,
            attributes: item.attributes || undefined,
            status: item.status || 'active',
            source: 'marketplace_sync',
          })
          createdProducts++
        } else {
          const fill = (field, value, placeholders = []) => {
            if (value == null || value === '') return
            const current = product[field]
            if (current == null || current === '' || placeholders.includes(current)) product[field] = value
          }
          fill('description', item.description)
          fill('category', item.category, ['General'])
          fill('brand', item.brand, ['TikTok Shop', 'DevBrand', shop.name])
          if (!product.brand || product.brand === 'TikTok Shop') product.brand = item.brand || ''
          if (item.images?.length && (!product.images || product.images.length === 0)) product.images = item.images
          if (item.weight != null && (product.weight == null || product.weight === 1)) product.weight = item.weight
          if (item.dimensions && product.dimensions?.length === 10 && product.dimensions?.width === 10 && product.dimensions?.height === 5) {
            product.dimensions = item.dimensions
          }
          if (item.attributes && Object.keys(item.attributes).length && (!product.attributes || !Object.keys(product.attributes).length)) {
            product.attributes = item.attributes
          }
          await product.save()
        }

        // 2. Link or update marketplace Listing
        await Listing.findOneAndUpdate(
          { productId: product._id, shopId: shop._id },
          {
            productId: product._id,
            shopId: shop._id,
            marketplace: shop.marketplace,
            externalListingId: item.externalListingId,
            price: item.price,
            status: 'live',
            lastSyncedAt: new Date(),
          },
          { upsert: true, new: true },
        )
        updatedListings++
      }

      return {
        productsImported: createdProducts,
        listingsLinked: updatedListings,
      }
    } catch (err) {
      console.warn(`Listing sync failed for shop ${shop.name}:`, err.message)
      return { productsImported: 0, listingsLinked: 0, error: err.message }
    }
  }

  /**
   * Full synchronization for a single shop (both orders & listings)
   */
  async syncAllForShop(shop) {
    const [ordersResult, listingsResult] = await Promise.all([
      this.syncOrdersForShop(shop).catch((err) => ({ error: err.message })),
      this.syncListingsForShop(shop).catch((err) => ({ error: err.message })),
    ])
    return { shopId: shop._id, shopName: shop.name, marketplace: shop.marketplace, orders: ordersResult, listings: listingsResult }
  }

  async syncInboxForShop(shop) {
    if (shop._id && !shop.auth?.accessTokenEnc) {
      shop = await Shop.findById(shop._id).select('+auth.accessTokenEnc')
    }
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) {
      return { shopName: shop.name, marketplace: shop.marketplace, imported: 0, error: `${shop.name} is not connected.` }
    }
    const service = this.getService(shop.marketplace)
    if (typeof service.getInbox !== 'function') {
      return { shopName: shop.name, marketplace: shop.marketplace, imported: 0, error: `${shop.name} inbox sync is not available.` }
    }
    let threads = []
    try {
      threads = await service.getInbox(token, shop)
    } catch (err) {
      const denied = err.status === 401 || /scope|access token|access denied|invalid access/i.test(err.message || '')
      return {
        shopName: shop.name,
        marketplace: shop.marketplace,
        imported: 0,
        error: denied
          ? `${shop.name} is connected, but this login does not include message access. Connect the shop again from Settings.`
          : err.message,
      }
    }
    let imported = 0
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
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      for (const message of thread.messages || []) {
        if (!message.externalMessageId) continue
        await Message.updateOne(
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
      }
      imported += 1
    }
    return { shopName: shop.name, marketplace: shop.marketplace, imported }
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
