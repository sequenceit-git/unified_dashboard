/**
 * Seller alerts that need a person to act: low stock, new orders, new inbox
 * messages, listing review failures, shop sync/token problems, and finished
 * research. Routine successful syncs do not create notifications.
 */

const Notification = require('../models/Notification')
const events = require('./events')

const SHOP_LABEL = { ebay: 'eBay', tiktok_shop: 'TikTok Shop', temu: 'Temu Shop' }
const FAILED_RAW = new Set(['FAILED', 'FREEZE', 'PLATFORM_DEACTIVATED'])

function shopLabel(marketplace) {
  return SHOP_LABEL[marketplace] || 'Shop'
}

function shopPath(path, marketplace) {
  const id = marketplace === 'tiktok_shop' ? 'tiktok' : marketplace
  return id ? `${path}?shop=${id}` : path
}

async function raise({ type, shopId = null, refId = null, key, title, message = '', href = '' }) {
  if (!type || !key || !title) return null
  const existing = await Notification.findOne({ key, isRead: false })
  const doc = existing || new Notification({ type, shopId, refId, key })
  doc.type = type
  doc.shopId = shopId
  doc.refId = refId
  doc.title = title
  doc.message = message
  doc.href = href
  doc.isRead = false
  await doc.save()
  await events.publish({
    type: 'notification',
    shopId: shopId ? String(shopId) : null,
    notificationId: String(doc._id),
    kind: type,
  })
  return doc
}

async function resolve(key) {
  if (!key) return
  await Notification.updateMany({ key, isRead: false }, { isRead: true })
}

function isLow(product) {
  if (!product || product.stock == null) return false
  const threshold = Number(product.lowStockThreshold ?? 5)
  return Number(product.stock) <= threshold
}

/** Notify only when stock first drops to the threshold, not on every later sync. */
async function stockChanged(product, shop, { was } = {}) {
  if (!product?._id) return
  const key = `low_stock:${product._id}`
  if (!isLow(product)) return resolve(key)
  if (was == null && product.source === 'marketplace_sync') return
  if (was != null && Number(was) <= Number(product.lowStockThreshold ?? 5)) return
  const shopId = shop?._id || null
  const marketplace = shop?.marketplace
  const count = Number(product.stock)
  await raise({
    type: 'low_stock',
    shopId,
    refId: product._id,
    key,
    title: count <= 0 ? 'Out of stock' : 'Low stock',
    message: `${product.title || product.sku || 'A product'} is at ${count} unit${count === 1 ? '' : 's'}${marketplace ? ` on ${shopLabel(marketplace)}` : ''}.`,
    href: shopPath('/inventory', marketplace),
  })
}

async function listingStatusChanged(listing, shop, { wasStatus, wasRaw } = {}) {
  if (!listing?._id || !shop) return
  const key = `listing_failed:${listing._id}`
  const nowFailed = listing.status === 'error' || FAILED_RAW.has(listing.marketplaceStatus)
  const wasFailed = wasStatus === 'error' || FAILED_RAW.has(wasRaw)
  if (!nowFailed) return resolve(key)
  if (wasFailed) return
  const raw = listing.marketplaceStatus
  const reason = raw === 'FREEZE'
    ? 'was frozen by TikTok Shop'
    : raw === 'PLATFORM_DEACTIVATED'
      ? 'was suspended by TikTok Shop'
      : 'failed shop review'
  await raise({
    type: 'listing_failed',
    shopId: shop._id,
    refId: listing.productId,
    key,
    title: 'Listing needs attention',
    message: `A ${shopLabel(shop.marketplace)} listing ${reason}.`,
    href: shopPath('/products', shop.marketplace),
  })
}

async function fromSync(kind, shop, result = {}) {
  if (!shop?._id) return
  const error = result.error || (kind === 'full' && (result.orders?.error || result.listings?.error)) || ''
  const failKey = `sync_failed:${shop._id}:${kind === 'full' ? 'full' : kind}`
  if (error) {
    await raise({
      type: 'sync_failed',
      shopId: shop._id,
      key: failKey,
      title: `${shopLabel(shop.marketplace)} sync failed`,
      message: `${kind} could not update: ${String(error).slice(0, 180)}`,
      href: shopPath(kind === 'inbox' ? '/inbox' : kind === 'orders' ? '/orders' : '/products', shop.marketplace),
    })
    return
  }
  await resolve(failKey)

  const created = Number(result.created || result.orders?.created || 0)
  if ((kind === 'orders' || kind === 'full') && created > 0) {
    await raise({
      type: 'new_order',
      shopId: shop._id,
      key: `new_order:${shop._id}:${new Date().toISOString().slice(0, 10)}`,
      title: created === 1 ? `New ${shopLabel(shop.marketplace)} order` : `${created} new ${shopLabel(shop.marketplace)} orders`,
      message: created === 1 ? 'A new order is waiting to be fulfilled.' : `${created} new orders are waiting to be fulfilled.`,
      href: shopPath('/orders', shop.marketplace),
    })
  }

  const newMessages = Number(result.newMessages || 0)
  if (kind === 'inbox' && newMessages > 0) {
    await raise({
      type: 'new_message',
      shopId: shop._id,
      key: `new_message:${shop._id}:${new Date().toISOString().slice(0, 10)}`,
      title: newMessages === 1 ? `New ${shopLabel(shop.marketplace)} message` : `${newMessages} new ${shopLabel(shop.marketplace)} messages`,
      message: 'A buyer is waiting for a reply in Inbox.',
      href: shopPath('/inbox', shop.marketplace),
    })
  }
}

async function tokenFailed(shop, reason) {
  if (!shop?._id) return
  await raise({
    type: 'token_expiring',
    shopId: shop._id,
    key: `token:${shop._id}`,
    title: `${shopLabel(shop.marketplace)} needs reconnecting`,
    message: reason || 'The shop login expired. Connect the shop again from Settings.',
    href: '/settings',
  })
}

async function reportFinished(report, { ok, count = 0, error = '' } = {}) {
  if (!report?._id) return
  await raise({
    type: 'report_ready',
    key: `report:${report._id}`,
    refId: report._id,
    title: ok ? 'Market research is ready' : 'Market research failed',
    message: ok
      ? `${count} opportunit${count === 1 ? 'y' : 'ies'} are ready to review.`
      : String(error || 'The research run did not finish.').slice(0, 180),
    href: '/market-research',
  })
}

module.exports = {
  raise,
  resolve,
  stockChanged,
  listingStatusChanged,
  fromSync,
  tokenFailed,
  reportFinished,
}
