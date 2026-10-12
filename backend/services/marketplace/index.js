/**
 * Unified Marketplace Manager
 * Single interface for eBay, TikTok Shop, and Temu operations
 */

const ebay = require('./ebay')
const tiktok = require('./tiktok')
const temu = require('./temu')
const config = require('../../config/marketplaces')
const Order = require('../../models/Order')
const Customer = require('../../models/Customer')
const SyncLog = require('../../models/SyncLog')
const Shop = require('../../models/Shop')
const Product = require('../../models/Product')
const Listing = require('../../models/Listing')

const marketplaceServices = {
  ebay,
  tiktok_shop: tiktok,
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

    return service.createListing(token, product, options)
  }


  /**
   * Pushes stock updates to a connected marketplace
   */
  async pushStock(shop, { sku, quantity, externalListingId, productId }) {
    const service = this.getService(shop.marketplace)
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) return { success: false, reason: 'unauthorized_shop' }

    if (shop.marketplace === 'ebay') {
      return service.updateStock(token, sku, quantity)
    }
    if (shop.marketplace === 'tiktok_shop') {
      return service.updateStock(token, { productId: externalListingId, skuId: sku, quantity })
    }
    if (shop.marketplace === 'temu') {
      return service.updateStock(token, { goodsId: externalListingId, skuId: sku, quantity })
    }
  }

  /**
   * Pushes shipping fulfillment & tracking number to the marketplace
   */
  async pushShipping(order, { carrier, trackingNumber }) {
    const shop = await Shop.findById(order.shopId).select('+auth.accessTokenEnc')
    if (!shop || !shop.auth?.accessTokenEnc) {
      return { pushed: false, note: 'Shop not connected or credentials not present' }
    }

    const token = shop.auth.accessTokenEnc
    const service = this.getService(order.marketplace)

    if (order.marketplace === 'ebay') {
      await service.createShippingFulfillment(token, order.externalOrderId, {
        carrier,
        trackingNumber,
        lineItems: order.items.map((i) => ({ lineItemId: i.sku, quantity: i.quantity })),
      })
      return { pushed: true }
    }

    if (order.marketplace === 'tiktok_shop') {
      await service.shipPackage(token, order.externalOrderId, {
        trackingNumber,
        shippingProviderId: carrier,
      })
      return { pushed: true }
    }

    if (order.marketplace === 'temu') {
      await service.confirmShipment(token, {
        orderSn: order.externalOrderId,
        expressCompanyId: carrier,
        trackingNumber,
      })
      return { pushed: true }
    }

    return { pushed: false }
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
      } else if (shop.marketplace === 'tiktok_shop') {
        const res = await service.getOrders(token, { pageSize: 50 })
        rawOrders = (res.order_list || []).map((o) => ({
          externalOrderId: o.id,
          placedAt: new Date(o.create_time * 1000),
          status: o.status === 'COMPLETED' ? 'delivered' : o.status === 'SHIPPED' ? 'shipped' : 'paid',
          buyer: {
            name: o.buyer_uid || 'TikTok Customer',
            email: o.buyer_email || '',
          },
          totals: {
            total: parseFloat(o.payment_info?.total_amount || 0),
            currency: o.payment_info?.currency || 'USD',
          },
          items: (o.item_list || []).map((li) => ({
            sku: li.seller_sku,
            title: li.product_name,
            quantity: li.quantity,
            unitPrice: parseFloat(li.sku_sale_price || 0),
          })),
        }))
      } else if (shop.marketplace === 'temu') {
        const res = await service.getOrders(token, { page: 1, pageSize: 50 })
        rawOrders = (res.order_list || []).map((o) => ({
          externalOrderId: o.order_sn,
          placedAt: new Date(o.created_at * 1000),
          status: o.order_status === 2 ? 'shipped' : 'paid',
          buyer: {
            name: o.receiver_name || 'Temu Customer',
            email: '',
          },
          totals: {
            total: (o.pay_amount || 0) / 100,
            currency: 'USD',
          },
          items: (o.item_list || []).map((li) => ({
            sku: li.out_sku_sn,
            title: li.goods_name,
            quantity: li.goods_number,
            unitPrice: (li.goods_price || 0) / 100,
          })),
        }))
      }

      let createdCount = 0
      let updatedCount = 0

      for (const ord of rawOrders) {
        let customer = null
        if (ord.buyer?.name) {
          customer = await Customer.findOneAndUpdate(
            { 'identities.externalBuyerId': ord.buyer.name },
            {
              name: ord.buyer.name,
              email: ord.buyer.email,
              $addToSet: { identities: { shopId: shop._id, marketplace: shop.marketplace, externalBuyerId: ord.buyer.name } },
            },
            { upsert: true, new: true },
          )
        }

        const existing = await Order.findOne({ shopId: shop._id, externalOrderId: ord.externalOrderId })
        if (existing) {
          existing.status = ord.status
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
    const service = this.getService(shop.marketplace)
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) return { success: false, reason: 'unauthorized_shop' }

    if (shop.marketplace === 'ebay') {
      return service.updatePrice(token, sku, price)
    }
    if (shop.marketplace === 'tiktok_shop') {
      return service.updatePrice(token, externalListingId, { skuId: sku, price })
    }
    if (shop.marketplace === 'temu') {
      return service.updatePrice(token, { goodsId: externalListingId, skuId: sku, price })
    }
  }

  /**
   * Looks up categories across marketplaces
   */
  async getCategories(shop, query = 'General') {
    const service = this.getService(shop.marketplace)
    const token = shop.auth?.accessTokenEnc || ''
    if (shop.marketplace === 'ebay') {
      return service.getCategories(token, query)
    }
    if (shop.marketplace === 'tiktok_shop') {
      return service.getCategories(token)
    }
    if (shop.marketplace === 'temu') {
      return service.getCategories(token)
    }
  }

  /**
   * Looks up category attribute schema across marketplaces
   */
  async getCategoryAttributes(shop, categoryId) {
    const service = this.getService(shop.marketplace)
    const token = shop.auth?.accessTokenEnc || ''
    if (shop.marketplace === 'ebay') {
      return service.getItemAspects(token, categoryId)
    }
    if (shop.marketplace === 'tiktok_shop') {
      return service.getCategoryAttributes(token, categoryId)
    }
    if (shop.marketplace === 'temu') {
      return service.getCategoryAttributes(token, categoryId)
    }
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
    const service = this.getService(order.marketplace)

    if (order.marketplace === 'ebay') {
      return service.issueRefund(token, order.externalOrderId, { reason, comment, amount })
    }
    if (order.marketplace === 'tiktok_shop') {
      return service.confirmReverseOrder(token, order.externalOrderId, 'AGREE')
    }
    if (order.marketplace === 'temu') {
      return { success: true, note: 'Temu return status recorded locally (API confirmation not supported)' }
    }
  }

  /**
   * Automatically initializes and connects shops if direct tokens are present in .env
   */
  async autoConnectFromEnv() {
    const directTokens = [
      { marketplace: 'ebay', name: 'eBay Store', token: config.ebay?.accessToken },
      { marketplace: 'tiktok_shop', name: 'TikTok Shop Store', token: config.tiktok_shop?.accessToken },
      { marketplace: 'temu', name: 'Temu Store', token: config.temu?.accessToken },
    ]

    for (const item of directTokens) {
      if (item.token) {
        await Shop.findOneAndUpdate(
          { marketplace: item.marketplace },
          {
            name: item.name,
            marketplace: item.marketplace,
            externalShopId: `${item.marketplace}-live-store`,
            status: 'connected',
            auth: {
              accessTokenEnc: item.token,
            },
            lastSyncAt: new Date(),
          },
          { upsert: true, new: true },
        )
      }
    }
  }

  /**
   * Synchronizes existing product listings from a marketplace shop into the platform
   * Automatically populates the Products catalog and Listings tab!
   */
  async syncListingsForShop(shop) {
    const token = shop.auth?.accessTokenEnc || ''
    if (!token) {
      return { synced: 0, reason: 'No active access token' }
    }

    const service = this.getService(shop.marketplace)
    let rawItems = []

    try {
      if (shop.marketplace === 'ebay') {
        const res = await service.getInventory(token, { limit: 50 })
        rawItems = (res.inventoryItems || []).map((item) => ({
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
        }))
      } else if (shop.marketplace === 'tiktok_shop') {
        const res = await service.getProducts(token, { pageSize: 50 })
        rawItems = (res.products || []).map((p) => ({
          sku: p.skus?.[0]?.seller_sku || `tt-${p.id}`,
          title: p.title,
          description: p.description || '',
          price: Number(p.skus?.[0]?.price?.amount || 19.99),
          stock: Number(p.skus?.[0]?.stock_infos?.[0]?.available_stock || 10),
          images: (p.main_images || []).map((img) => img.uri || img.url),
          weight: Number(p.package_weight?.value || 1),
          category: p.category_chains?.[0]?.name || 'General',
          externalListingId: p.id,
        }))
      } else if (shop.marketplace === 'temu') {
        const res = await service.getGoodsList(token, { pageSize: 50 })
        rawItems = (res.goods_list || []).map((g) => ({
          sku: g.sku_list?.[0]?.out_sku_sn || `temu-${g.goods_id}`,
          title: g.goods_name,
          description: g.goods_desc || '',
          price: Number(g.sku_list?.[0]?.price || 1999) / 100,
          stock: Number(g.sku_list?.[0]?.quantity || 10),
          images: g.carousel_image_list || [],
          weight: Math.round((g.weight || 450) / 453.592),
          category: g.cat_name || 'General',
          externalListingId: String(g.goods_id),
        }))
      }

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
            stock: item.stock || 10,
            status: 'active',
            source: 'manual',
          })
          createdProducts++
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
