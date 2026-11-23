/**
 * Cross-shop coordination for one product listed on several shops. A product (one Product
 * document) shares its stock; when it changes, each of its listings is updated **by that
 * listing's own shop** (registry.get(key).app.catalog). This file only finds the listings and
 * keeps their stored stock/status in step; how to push lives in each shop's folder.
 */
const Listing = require('../../models/Listing')
const Shop = require('../../models/Shop')
const registry = require('../../marketplaces')

const appOf = (shop) => registry.get(shop.marketplace).app

/**
 * Pushes the shared product stock to the live listings of the other shops. A listing's stored
 * stock is set before the push (and put back if it fails) so that shop's next sync reads no
 * change and does not count the push as a sale.
 */
async function propagateStock(product, { exceptShopId = null, onlyListingId = null } = {}) {
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
      const res = await appOf(shop).catalog.pushStock(shop, listing, product, quantity)
      if (res?.status === 'ended' || res?.ended) {
        listing.status = 'ended'
        listing.marketplaceStatus = res.marketplaceStatus || 'Ended'
      }
      listing.syncError = null
      listing.lastSyncedAt = new Date()
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

/**
 * Pushes dashboard edits (title, description, images, price, stock) to every linked listing
 * that is live on its marketplace. Returns one result per listing.
 */
async function pushProductChanges(product, changes) {
  const results = []
  const listings = await Listing.find({ productId: product._id, status: { $in: ['live', 'out_of_stock', 'pending', 'paused'] } })
  for (const listing of listings) {
    const shop = await Shop.findById(listing.shopId)
    if (!shop || shop.status !== 'connected') continue
    let res
    try {
      res = await appOf(shop).catalog.pushChanges(shop, listing, product, changes)
      if (res === null) continue // this shop can't revise listings
      listing.syncError = null
      if (changes.price != null && !res?.skipped?.includes('price')) listing.price = changes.price
      if (changes.quantity != null) listing.stock = Math.max(0, Math.floor(Number(changes.quantity)))
      if (res?.status === 'ended' || res?.ended) {
        listing.status = 'ended'
        listing.marketplaceStatus = res.marketplaceStatus || 'Ended'
      } else if (changes.quantity != null && ['live', 'out_of_stock'].includes(listing.status)) {
        listing.status = Number(changes.quantity) > 0 ? 'live' : 'out_of_stock'
      }
      results.push({ shopName: shop.name, ok: true, ...(res?.skipped?.length ? { skipped: res.skipped } : {}) })
    } catch (err) {
      listing.syncError = err.message
      results.push({ shopName: shop.name, ok: false, error: err.message })
    }
    if (changes.quantity != null || !listing.lastSyncedAt) listing.lastSyncedAt = new Date()
    await listing.save()
  }
  // An ended listing is off sale; revising stock cannot bring it back, a restock relists it
  // (shops whose app has catalog.relist).
  if (Number(changes.quantity) > 0) {
    const relistable = registry.all().filter((a) => typeof a.app?.catalog?.relist === 'function').map((a) => a.key)
    const ended = relistable.length ? await Listing.find({ productId: product._id, status: 'ended', marketplace: { $in: relistable } }) : []
    for (const listing of ended) {
      const shop = await Shop.findById(listing.shopId)
      if (!shop || shop.status !== 'connected') continue
      try {
        const result = await appOf(shop).catalog.relist(shop, listing, changes)
        if (result === null) continue
        listing.status = result.status || 'live'
        if (result.externalListingId) listing.externalListingId = result.externalListingId
        listing.listingUrl = registry.listingUrl(shop.marketplace, listing.externalListingId, '')
        listing.marketplaceStatus = 'Active'
        listing.stock = Math.max(0, Math.floor(Number(changes.quantity)))
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

module.exports = { propagateStock, pushProductChanges }
