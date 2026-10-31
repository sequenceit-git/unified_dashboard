/**
 * Seller alerts that need a person to act: low stock, new orders, new inbox
 * messages, listing review failures, shop sync/token problems, and finished
 * research. Routine successful syncs do not create notifications.
 */

const Notification = require('../models/Notification')
const Product = require('../models/Product')
const events = require('./events')

const SHOP_LABEL = { ebay: 'eBay', tiktok_shop: 'TikTok Shop', temu: 'Temu Shop' }
const FAILED_RAW = new Set(['FAILED', 'FREEZE', 'PLATFORM_DEACTIVATED'])
const DRAFT_RAW = 'DRAFT'

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

function shopRef(shop) {
  if (!shop) return { shopId: null, marketplace: undefined }
  if (shop.marketplace || shop.name) return { shopId: shop._id || null, marketplace: shop.marketplace }
  return { shopId: shop._id || shop, marketplace: undefined }
}

function listingNeedsAttention(status, raw) {
  return status === 'error' || FAILED_RAW.has(raw) || raw === DRAFT_RAW
}

function listingAlertTitle(raw, { sentBackToDraft } = {}) {
  if (raw === 'FREEZE') return 'TikTok listing was frozen'
  if (raw === 'PLATFORM_DEACTIVATED') return 'TikTok listing was suspended'
  if (raw === 'FAILED') return 'TikTok listing was rejected'
  if (raw === DRAFT_RAW || sentBackToDraft) return 'TikTok listing is a draft'
  return 'Listing needs attention'
}

function listingAlertReason(listing, raw, { sentBackToDraft } = {}) {
  if (listing.syncError) return listing.syncError
  if (raw === 'FREEZE') return 'TikTok Shop froze this listing.'
  if (raw === 'PLATFORM_DEACTIVATED') return 'TikTok Shop suspended this listing.'
  if (raw === 'FAILED') return 'TikTok Shop rejected this product in review.'
  if (sentBackToDraft || raw === DRAFT_RAW) return 'TikTok Shop sent this listing back to Draft. It is not in review.'
  return 'This listing failed shop review.'
}

/** Notify only when stock first drops to the threshold, not on every later sync. */
async function stockChanged(product, shop, { was } = {}) {
  if (!product?._id) return
  const key = `low_stock:${product._id}`
  if (!isLow(product)) return resolve(key)
  if (was == null && product.source === 'marketplace_sync') return
  if (was != null && Number(was) <= Number(product.lowStockThreshold ?? 5)) return
  const { shopId, marketplace } = shopRef(shop)
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

/**
 * Alert when a listing is rejected, frozen, suspended, or sent back to Draft.
 * Staying in Draft/Failed does not clear the unread alert. First-time marketplace
 * imports of already-draft products are skipped so old drafts do not flood the bell.
 */
async function listingStatusChanged(listing, shop, { wasStatus, wasRaw, imported } = {}) {
  if (!listing?._id || !shop) return
  const key = `listing_failed:${listing._id}`
  const raw = listing.marketplaceStatus
  const sentBackToDraft = wasRaw === 'PENDING' && raw === DRAFT_RAW
  const importedDraft = imported && !wasRaw && raw === DRAFT_RAW
  const nowAlert = !importedDraft && listingNeedsAttention(listing.status, raw)
  const wasAlert = listingNeedsAttention(wasStatus, wasRaw)
  if (!nowAlert) return resolve(key)
  const product = await Product.findById(listing.productId).select('title sku').lean()
  const name = product?.title || product?.sku || 'A listing'
  const reason = listingAlertReason(listing, raw, { sentBackToDraft })
  const message = `${name}: ${reason}`
  if (wasAlert && raw === wasRaw && !sentBackToDraft) {
    const seen = await Notification.findOne({ key })
    if (seen?.isRead) return
    if (seen && seen.message === message) return
  }
  await raise({
    type: 'listing_failed',
    shopId: shop._id,
    refId: listing.productId,
    key,
    title: listingAlertTitle(raw, { sentBackToDraft }),
    message,
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
  await resolve(`token:${shop._id}`)

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
