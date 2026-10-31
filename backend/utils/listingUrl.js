/**
 * Page for a listing, so the product list can open it in a new tab.
 * TikTok Shop product IDs are US-shop IDs. Opening /shop/pdp/{id} from another country
 * (e.g. Bangladesh) is rewritten to that country's storefront and returns
 * "Product ID is invalid". Lock the US shop with ?region=US. Drafts have no public page,
 * so those open Seller Center instead.
 */
function listingUrl(marketplace, externalListingId, saved, { status } = {}) {
  if (saved && marketplace !== 'tiktok_shop') return saved
  const id = String(externalListingId || '').trim()
  if (!id) return ''
  if (marketplace === 'ebay') {
    const itemId = id.replace(/^(ebay-)?item-/, '')
    return /^\d{9,}$/.test(itemId) ? `https://www.ebay.com/itm/${itemId}` : ''
  }
  if (marketplace === 'tiktok_shop') {
    const productId = id.split(':')[0]
    if (!productId) return ''
    const publicPage = status === 'live' || status === 'out_of_stock'
    return publicPage
      ? `https://shop.tiktok.com/view/product/${productId}?region=US`
      : `https://seller-us.tiktok.com/product/edit?product_id=${productId}`
  }
  if (marketplace === 'temu') {
    return /^\d+$/.test(id) ? `https://www.temu.com/goods.html?goods_id=${id}` : ''
  }
  return ''
}

module.exports = { listingUrl }
